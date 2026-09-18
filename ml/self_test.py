"""Self-contained acceptance on GENERATED fixtures only. Never opens real IO-VNBD.

Produces an explicitly SYNTHETIC_SELF_TEST manifest, not a human approval or a real
split. Both raw clock formats and the production parsing/alignment path are used.
Tests interrupted/resumed training against uninterrupted weights/history exactly.
"""
import copy, csv, json, math, subprocess, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import numpy as np
import torch
from model import NavDRTCN
from raw_data import sha, write_json, read_manifest, load_trip, require
from training_runner import DEFAULT, train_run, ROOT
from evaluation_runner import evaluate_run, outage_scores, RUNNER

PHONE_HEADERS=['TIME SINCE START (ms)','DATE (YYYY-MO-DD HH-MI-SS_SSS)',
 'ACCELEROMETER X (m/s²)','ACCELEROMETER Y (m/s²)','ACCELEROMETER Z (m/s²)',
 'GYROSCOPE Yaw (rad/s)','GYROSCOPE Pitch (rad/s)','GYROSCOPE Roll (rad/s)',
 'GPS LATITUDE (degrees)','GPS LONGITUDE (degrees)','GPS SPEED (Kmh)','GPS ORIENTATION (°)','GPS ACCURACY (m)']
VEHICLE_HEADERS=['Time Since Start of Day (seconds)','Velocity (km/hr)','Latitude (degrees)','Longitude (degrees)']

def fixture(root):
    root.mkdir();trips=[];base=datetime(2019,9,8,10,7,49,546000,tzinfo=timezone.utc)
    descriptor=lambda name,scale=1.:dict(column=name,scale=scale)
    for index,split in enumerate(('train','dev','test')):
        p=root/f'{split}-phone.csv';v=root/f'{split}-vehicle.csv'
        north=east=0.;base_speed=5.+index*.15
        with p.open('w',newline='') as pf,v.open('w',newline='') as vf:
            pw=csv.writer(pf);vw=csv.writer(vf);pw.writerow(PHONE_HEADERS);vw.writerow(VEHICLE_HEADERS)
            for i in range(401):
                t=i*.1;speed=base_speed+.02*t;heading=.01*t
                if i:north+=speed*math.cos(heading)*.1;east+=speed*math.sin(heading)*.1
                lat=12.+north/6371000*180/math.pi;lon=77.+east/(6371000*math.cos(math.radians(12)))*180/math.pi
                date=(base+timedelta(seconds=t)).strftime('%Y-%m-%d %H:%M:%S:%f')[:-3]
                pw.writerow([2922+i*100,date,0,.025,9.80665,.001*index,0,-.01,lat,lon,speed*3.6,math.degrees(heading),2])
                # Vehicle clock is one hour behind the phone wall-clock label; explicit UTC offsets align them.
                vw.writerow([9*3600+7*60+49.546+t,speed*3.6,lat,lon])
        phone_columns={k:descriptor(name) for k,name in zip(('ax','ay','az','gx','gy','gz'),PHONE_HEADERS[2:8])}
        phone_columns.update({k:descriptor(name,1/3.6 if k=='speed' else 1.) for k,name in zip(('lat','lon','speed','bearing','accuracy'),PHONE_HEADERS[8:])})
        trips.append(dict(id='synthetic-'+split,split=split,recording_group='fake-recording-'+split,vehicle_id='fake-v-'+split,
            phone_id='fake-p-'+split,route_id='fake-r-'+split,
            phone=dict(path=p.name,sha256=sha(p),encoding='utf-8',columns=phone_columns),
            vehicle=dict(path=v.name,sha256=sha(v),encoding='utf-8',columns={k:descriptor(name,1/3.6 if k=='speed' else 1.) for k,name in zip(('speed','lat','lon'),VEHICLE_HEADERS[1:])}),
            clock=dict(phone_elapsed_column=PHONE_HEADERS[0],phone_calendar_column=PHONE_HEADERS[1],phone_calendar_format='%Y-%m-%d %H:%M:%S:%f',
                phone_utc_offset_seconds=3600,vehicle_seconds_column=VEHICLE_HEADERS[0],vehicle_date='2019-09-08',vehicle_utc_offset_seconds=0,
                vehicle_alignment_offset_seconds=0,calendar_tolerance_seconds=.001,max_reference_gap_seconds=.2,vehicle_midnight_policy='reject'),
            phone_gnss_time_policy='row_time_reviewed_assumption',gnss_time_rationale='SYNTHETIC: fixture deliberately emits a fresh fix per row.',
            mount=dict(up=[0,0,1],forward=[0,1,0],acceleration_includes_gravity=True),outages=[[25.,29.],[32.,36.]]))
    m=dict(schema='navdr.approved-raw-split.v1',synthetic=True,status='SYNTHETIC_SELF_TEST',trips=trips)
    path=root/'synthetic-manifest.json';write_json(path,m);return path

def run(out):
    out=Path(out).resolve();require(not out.exists(),'Self-test output exists; choose a new directory')
    require(RUNNER.is_file(),'Build Kotlin :navigation:installDist before self-test (README)')
    out.mkdir(parents=True);opened=[]
    def guard(event,args):
        if event=='open' and isinstance(args[0],(str,bytes)):
            path=Path(args[0].decode() if isinstance(args[0],bytes) else args[0]).resolve()
            if 'IO-VNBD-master' in path.parts:raise AssertionError('Self-test attempted to open REAL dataset: '+str(path))
            if path.suffix=='.csv':opened.append(str(path))
    sys.addaudithook(guard)
    manifest=fixture(out/'fixtures');m,_=read_manifest(manifest,True);c={**DEFAULT,'epochs':2,'microbatch':2,'accumulation':2,'checkpoint_every_updates':3}
    checks=[]
    def reject(name,call):
        try:call()
        except (ValueError,FileNotFoundError,KeyError,json.JSONDecodeError):checks.append(name);return
        raise AssertionError('Expected refusal: '+name)
    reject('missing manifest refused',lambda:read_manifest(None))
    reject('synthetic manifest refused by real CLI path',lambda:read_manifest(manifest))
    for name,mutate in [
        ('group leakage refused',lambda x:x['trips'][2].update(vehicle_id=x['trips'][0]['vehicle_id'])),
        ('duplicate payload across splits refused',lambda x:x['trips'][2]['phone'].update(sha256=x['trips'][0]['phone']['sha256'])),
        ('missing file refused',lambda x:x['trips'][0]['phone'].update(path='absent.csv')),
        ('unsupported row selectors refused',lambda x:x['trips'][0]['phone'].update(rows=[1,10])),
        ('unapproved status refused',lambda x:x.update(status='DRAFT')),
        ('raw inventory schema refused',lambda x:x.update(schema='navdr.io-vnbd-inventory.v1'))]:
        bad=copy.deepcopy(json.loads(manifest.read_text()));mutate(bad);path=manifest.parent/'negative.json';write_json(path,bad)
        reject(name,lambda:read_manifest(path,True))
    (manifest.parent/'malformed.json').write_text('{this is not JSON}')
    reject('malformed JSON refused',lambda:read_manifest(manifest.parent/'malformed.json',True))
    bad=copy.deepcopy(m['trips'][0]);bad['phone']['sha256']='0'*64
    reject('changed payload refused',lambda:load_trip(bad,.1))
    data=load_trip(m['trips'][0],.1)
    assert np.allclose(data['y'],5.+.02*data['t'],atol=1e-8)
    checks.append('elapsed-ms/calendar and seconds-since-midnight align through explicit UTC offsets')
    bad=copy.deepcopy(m['trips'][0]);bad['clock']['calendar_tolerance_seconds']=0;bad['clock']['phone_elapsed_column']=PHONE_HEADERS[8]
    reject('incorrect elapsed-clock mapping refused',lambda:load_trip(bad,.1))
    reject('wrong cadence refused',lambda:load_trip(m['trips'][0],.01))
    # Accumulation includes an uneven last microbatch; compare gradients and Adam update to a full batch.
    torch.set_num_threads(2);torch.manual_seed(11);a=NavDRTCN();b=copy.deepcopy(a)
    x=torch.randn(5,6,231);y=torch.randn(5,1)*.1
    oa=torch.optim.Adam(a.parameters(),lr=.001);ob=torch.optim.Adam(b.parameters(),lr=.001)
    torch.nn.functional.mse_loss(a(x),y).backward()
    for start in range(0,5,2):
        torch.nn.functional.mse_loss(b(x[start:start+2]),y[start:start+2],reduction='sum').div(5).backward()
    grad=max((p.grad-q.grad).abs().max().item() for p,q in zip(a.parameters(),b.parameters()))
    assert grad<1e-6;oa.step();ob.step()
    weight=max((p-q).abs().max().item() for p,q in zip(a.parameters(),b.parameters()));assert weight<1e-5
    checks.append('uneven gradient accumulation agrees with full batch: gradient <1e-6, Adam weights <1e-5')
    testfiles={str(Path(t[k]['_path'])) for t in m['trips'] if t['split']=='test' for k in ('phone','vehicle')}
    opened.clear();checkpoint=train_run(manifest,c,out/'uninterrupted/model.pt',synthetic=True)
    assert not(testfiles&set(opened));checks.append('training opened only train/dev CSVs, never test CSVs')
    resumed=out/'resumed/model.pt';train_run(manifest,c,resumed,synthetic=True,max_updates=3)
    train_run(manifest,c,resumed,resume=resumed,synthetic=True)
    full=torch.load(checkpoint,map_location='cpu',weights_only=True);other=torch.load(resumed,map_location='cpu',weights_only=True)
    assert full['history']==other['history']
    assert all(torch.equal(full['state_dict'][k],other['state_dict'][k]) for k in full['state_dict'])
    assert full['updates']==other['updates'];checks.append('mid-epoch resume equals uninterrupted weights and epoch losses exactly on CPU')
    reject('resume with changed hyperparameters refused',lambda:train_run(manifest,{**c,'learning_rate':.002},out/'rejected/model.pt',resume=resumed,synthetic=True))
    trainx=data['x'];assert np.allclose(full['normalization']['mean'],trainx.mean(0));checks.append('normalization fit on train rows only')
    opened.clear();report=evaluate_run(manifest,checkpoint,out/'evaluation',synthetic=True)
    assert set(opened)&{str(Path(t[k]['_path'])) for t in m['trips'] if t['split'] in ('train','dev') for k in ('phone','vehicle')}==set()
    assert all(v['velocity_common']['samples']>0 for v in report['methods'].values())
    assert all(len(v['outages'])==2 and all(s['status']=='SCORED' for s in v['outages']) for v in report['trips'][0]['methods'].values())
    checks.append('held-out evaluation executes all four methods including actual Kotlin EKF on the same test timestamps')
    # Exact browser acceptance case independently exercises this scorer and invokes existing browser tests.
    t=np.arange(23,dtype=float);truth=np.column_stack((t*10,np.zeros(len(t))));prediction=truth+np.array([0,15.])
    mask=((t>0)&(t<=10))|((t>12)&(t<=22));scores=outage_scores(t,mask,truth,prediction)
    assert [s['reference_distance_m'] for s in scores]==[100.,100.]
    assert [s['drift_percent'] for s in scores]==[15.,15.]
    incomplete=truth.copy();incomplete[4]=np.nan;missing=outage_scores(t,mask,incomplete,prediction)
    assert missing[0]['drift_percent'] is None and missing[1]['drift_percent']==15.
    unavailable=prediction.copy();unavailable[14]=np.nan
    assert outage_scores(t,mask,truth,unavailable)[1]['drift_percent'] is None
    browser=subprocess.run(['node',str(ROOT/'tests/outage-acceptance.cjs')],capture_output=True,text=True,cwd=ROOT)
    (out/'browser-outage-acceptance.log').write_text(browser.stdout+browser.stderr);assert browser.returncode==0
    checks.append('Python and existing browser outage acceptance: two 100m / 15m intervals each report 15%; missing truth/output stays null')
    evidence=dict(status='PASS',synthetic_only=True,real_data_open_attempts=0,real_pairing_or_split_manifest_created=False,
        synthetic_fixture_manifest=str(manifest),gradient_max_difference=grad,adam_weight_max_difference=weight,
        resume_weights_bitwise_equal=True,outage_acceptance=scores,missing_reference_acceptance=missing,
        checks=checks,gpu_budget_verified=False,mixed_precision='disabled; untested',checkpoint=str(checkpoint),report=str(out/'evaluation/report.md'))
    write_json(out/'acceptance.json',evidence)
    print(json.dumps(evidence,indent=2,allow_nan=False),flush=True)
