"""Held-out evaluation with isolated reference, four methods, and per-outage scoring.

The learned model predicts scalar speed, not heading. Model and simple baselines use
only phone GNSS before/outside outages and mount-projected gyro inside outages. The
classical comparator is the ACTUAL Kotlin NavigationEngine, not a reimplementation.
No vehicle reference enters any estimator, including the Kotlin wire input.
"""
import argparse, csv, json, math, subprocess
from pathlib import Path
import numpy as np
import torch
from model import NavDRTCN
from raw_data import read_manifest, load_trip, require, sha, local, write_json
from training_runner import ROOT, confighash

METHODS=('learned_speed_gyro','raw_integration','last_speed_gyro','classical_ekf')
RUNNER=ROOT/'native/android/navigation/build/install/navigation/bin/navigation'

def outage_scores(t, mask, reference, prediction):
    """Matches browser OutageScorer: each masked row owns (previous,current].
    Eligibility: >=3 seconds, >5m, complete truth and output; never pool intervals.
    Uses the adapter's local tangent plane in meters; browser uses geodesic distance.
    """
    results=[];i=0
    while i<len(t):
        if not mask[i]:i+=1;continue
        start=i
        while i+1<len(t) and mask[i+1]:i+=1
        end=i;previous=max(0,start-1);truth=reference[previous:end+1];pred=prediction[start:end+1]
        duration=float(t[end]-t[previous]);refok=start>0 and np.isfinite(truth).all();outok=np.isfinite(pred).all()
        distance=float(np.linalg.norm(np.diff(truth,axis=0),axis=1).sum()) if refok else None
        peak=float(np.linalg.norm(pred-reference[start:end+1],axis=1).max()) if refok and outok else None
        status='INCOMPLETE REFERENCE' if not refok else 'INCOMPLETE OUTPUT' if not outok else 'SCORED' if duration>=3-1e-8 and distance>5 else 'INSUFFICIENT DATA'
        results.append(dict(id=len(results)+1,start_seconds=float(t[previous]),end_seconds=float(t[end]),duration_seconds=duration,
            reference_distance_m=distance,peak_position_error_m=peak,drift_percent=100*peak/distance if status=='SCORED' else None,status=status))
        i+=1
    return results

def simple_estimators(data,predicted_speed):
    n=len(data['t']);positions={k:np.full((n,2),np.nan) for k in METHODS[:3]};speeds={k:np.full(n,np.nan) for k in METHODS[:3]}
    for name in METHODS[:3]:
        pos=None;speed=None;heading=None
        for i,t in enumerate(data['t']):
            if not data['outage'][i] and data['validgps'][i]:
                pos=data['gpsxy'][i].copy();speed=data['gps'][i,2];heading=math.radians(data['gps'][i,3])
            elif pos is not None and i:
                dt=t-data['t'][i-1];heading-=float(data['x'][i,3:]@data['up'])*dt
                if name=='raw_integration':speed=float(np.clip(speed+(data['x'][i,:3]-9.80665*data['up'])@data['forward']*dt,0,60))
                elif name=='learned_speed_gyro':
                    if not np.isfinite(predicted_speed[i]):pos=None;continue
                    speed=float(np.clip(predicted_speed[i],0,60))
                pos=pos+np.array([math.cos(heading),math.sin(heading)])*speed*dt
            if pos is not None:
                positions[name][i]=pos
                speeds[name][i]=predicted_speed[i] if name=='learned_speed_gyro' else speed
    return positions,speeds

def kotlin_baseline(data,out,runner):
    wire=out/'estimator-only.tsv';result=out/'kotlin-output.csv'
    with wire.open('w') as f:
        f.write('\t'.join(map(str,['navdr.estimator.v1',*data['up'],*data['forward']]))+'\n')
        for i,t in enumerate(data['t']):
            timestamp=round(t*1e9);hasfix=bool(data['validgps'][i] and not data['outage'][i]);gps=data['gps'][i]
            values=[timestamp,timestamp,*data['x'][i],hasfix,hasfix]
            values += [timestamp,gps[0],gps[1],gps[4],gps[2],gps[3],False] if hasfix else [None]*7
            f.write('\t'.join('null' if v is None else str(v).lower() if type(v) is bool else str(v) for v in values)+'\n')
    proc=subprocess.run([str(runner.resolve()),str(wire.resolve()),str(result.resolve())],capture_output=True,text=True)
    (out/'kotlin.log').write_text(proc.stdout+proc.stderr)
    require(proc.returncode==0,'Kotlin baseline failed: '+proc.stderr)
    with result.open() as f:rows=list(csv.DictReader(f))
    require(len(rows)==len(data['t']),'Kotlin output row mismatch')
    require(all(int(row['timestampNs'])==round(t*1e9) for row,t in zip(rows,data['t'])),'Kotlin output timestamp mismatch')
    number=lambda v:np.nan if v=='null' else float(v)
    pos=local(np.array([number(r['lat']) for r in rows]),np.array([number(r['lon']) for r in rows]),data['origin'])
    speed=np.array([number(r['speedMps']) for r in rows])
    for i,row in enumerate(rows):
        if row['mode'] in ('UNAVAILABLE','WAITING_FOR_COURSE'):pos[i]=np.nan;speed[i]=np.nan
    return pos,speed

def metrics(errors):
    e=np.asarray(errors);return dict(samples=len(e),mae_mps=float(np.abs(e).mean()) if len(e) else None,rmse_mps=float(np.sqrt((e**2).mean())) if len(e) else None)

def evaluate_run(manifest_path,checkpoint,out,runner=RUNNER,split='test',synthetic=False):
    manifest,mhash=read_manifest(manifest_path,synthetic);out=Path(out)
    require(not out.exists(),'Evaluation output directory exists; choose a new one')
    require(Path(runner).is_file(),'Kotlin runner missing; build :navigation:installDist (README)')
    ck=torch.load(checkpoint,map_location='cpu',weights_only=True)
    require(ck.get('schema')=='navdr.training-checkpoint.v2','Unsupported checkpoint')
    require(ck['manifest_sha256']==mhash and ck['synthetic']==synthetic,'Checkpoint/manifest mismatch')
    require(ck['model_source_sha256']==sha(ROOT/'ml/model.py'),'Model source changed since training')
    require(ck['pipeline_sha256']==confighash({p:sha(ROOT/'ml'/p) for p in ('raw_data.py','training_runner.py','resource_guard.py')}),'Training/parser source changed; use original version')
    c=ck['config'];model=NavDRTCN();model.load_state_dict(ck['state_dict']);model.eval();torch.set_num_threads(2)
    out.mkdir(parents=True);allerrors={k:[] for k in METHODS};ownerrors={k:[] for k in METHODS};trips=[]
    mean=np.array(ck['normalization']['mean']);std=np.array(ck['normalization']['std'])
    for tid,trip in enumerate(manifest['trips']):
        if trip['split']!=split:continue
        data=load_trip(trip,c['period_seconds']);n=len(data['t']);pred=np.full(n,np.nan)
        with torch.inference_mode():
            for i in range(c['window']-1,n):
                x=((data['x'][i-c['window']+1:i+1]-mean)/std).T
                pred[i]=float(model(torch.tensor(x[None],dtype=torch.float32)).item())*c['target_scale_mps']
        require(np.isfinite(pred[c['window']-1:]).all(),'Nonfinite model prediction')
        positions,speeds=simple_estimators(data,pred);directory=out/f'trip-{tid:04d}';directory.mkdir()
        positions['classical_ekf'],speeds['classical_ekf']=kotlin_baseline(data,directory,Path(runner))
        common=np.isfinite(data['y'])&np.isfinite(pred)
        for speed in speeds.values():common &= np.isfinite(speed)
        results={}
        for name in METHODS:
            eligible=np.isfinite(data['y'])&np.isfinite(pred)&np.isfinite(speeds[name])
            errors=(speeds[name]-data['y'])[eligible];shared=(speeds[name]-data['y'])[common]
            ownerrors[name].extend(errors.tolist());allerrors[name].extend(shared.tolist())
            results[name]=dict(velocity_common=metrics(shared),velocity_available=metrics(errors),outages=outage_scores(data['t'],data['outage'],data['reference'],positions[name]))
        with (directory/'predictions.csv').open('w') as f:
            w=csv.writer(f);w.writerow(['seconds','outage','reference_speed_mps','reference_north_m','reference_east_m',*[name+suffix for name in METHODS for suffix in ('_speed_mps','_north_m','_east_m')]])
            for i in range(n):
                values=[data['t'][i],int(data['outage'][i]),data['y'][i],*data['reference'][i]]
                for name in METHODS:values.extend([speeds[name][i],*positions[name][i]])
                w.writerow([v if np.isfinite(v) else '' for v in values])
        trips.append(dict(id=trip['id'],rows=n,common_velocity_samples=int(common.sum()),methods=results,gnss_time_rationale=trip['gnss_time_rationale']))
    jars=Path(runner).resolve().parent.parent/'lib'
    report=dict(schema='navdr.evaluation.v2',synthetic=synthetic,split=split,checkpoint_sha256=sha(checkpoint),manifest_sha256=mhash,
        model_source_sha256=ck['model_source_sha256'],evaluator_source_sha256=sha(__file__),parser_source_sha256=sha(ROOT/'ml/raw_data.py'),
        kotlin_runner=str(Path(runner).resolve()),kotlin_artifact_sha256={p.name:sha(p) for p in sorted(jars.glob('*.jar'))},
        methods={k:dict(velocity_common=metrics(allerrors[k]),velocity_available=metrics(ownerrors[k])) for k in METHODS},trips=trips,
        warnings=['SYNTHETIC CORRECTNESS ONLY; no real accuracy conclusion.' if synthetic else 'User-run offline experiment; field accuracy is not established.',
            'Scalar TCN speed plus phone-gyro heading; not a learned position/heading model or a deployed fusion policy.',
            'Phone GNSS row timestamps are a reviewer-approved assumption, not verified fix ages.',
            'All methods receive the same phone inputs and outage mask; vehicle reference is evaluation/label only.',
            'Velocity common metrics use the intersection of available windows across all methods; per-method coverage is also shown.',
            'Per-outage drift is not pooled. Missing truth/output yields null, never zero.',
            'Browser scoring formula/eligibility matched; this adapter uses local tangent-plane distances.',
            'Kotlin engine retains its >100 ms gap and 30 s outage limits; unavailable output is explicitly unscored.',
            'No automatic clock alignment, gap repair, axis inference, or duplicate selection was performed.'])
    write_json(out/'report.json',report)
    fmt=lambda v:'unavailable' if v is None else f'{v:.6f}'
    lines=['# NavDR evaluation', '', '**Synthetic fixture test — not real-world accuracy.**' if synthetic else '**Offline held-out experiment — not field certification.**','',
        f'Split: {split}. Trips: {len(trips)}. Checkpoint completed epochs: {ck["epoch"]}.', '',
        'Lower velocity MAE/RMSE is better. The table uses exactly the same available timestamps for all methods. Inspect coverage before comparing.', '',
        '| Method | Common samples | MAE (m/s) | RMSE (m/s) |','| --- | ---: | ---: | ---: |']
    for name in METHODS:
        m=report['methods'][name]['velocity_common'];lines.append(f'| {name} | {m["samples"]} | {fmt(m["mae_mps"])} | {fmt(m["rmse_mps"])} |')
    lines+=['','## Each outage separately','','Drift = 100 × peak position error / reference distance within that outage. Unavailable means it cannot be scored; it does not mean zero error.','',
        '| Trip | Method | Outage | Distance (m) | Peak error (m) | Drift (%) | Status |','| --- | --- | ---: | ---: | ---: | ---: | --- |']
    for trip in trips:
        for name in METHODS:
            for score in trip['methods'][name]['outages']:
                lines.append(f'| {trip["id"]} | {name} | {score["id"]} | {fmt(score["reference_distance_m"])} | {fmt(score["peak_position_error_m"])} | {fmt(score["drift_percent"])} | {score["status"]} |')
    lines+=['','## Interpretation and limits','']+['- '+s for s in report['warnings']]
    lines+=['','`report.json` includes per-method available counts and each trip/outage. `trip-*/predictions.csv` contains aligned outputs for inspection. No test-based tuning or production decision is made by this tool.','']
    (out/'report.md').write_text('\n'.join(lines));print(json.dumps(dict(event='evaluation_completed',synthetic=synthetic,report=str(out/'report.md'),methods=report['methods']),allow_nan=False),flush=True)
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--split-manifest',type=Path,required=True);p.add_argument('--checkpoint',type=Path,required=True)
    p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--split',choices=('dev','test'),default='test');p.add_argument('--kotlin-runner',type=Path,default=RUNNER);a=p.parse_args()
    try:evaluate_run(a.split_manifest,a.checkpoint,a.output_dir,a.kotlin_runner,a.split)
    except Exception as e:p.exit(1,type(e).__name__+': '+str(e)+'\n')
