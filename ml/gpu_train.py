#!/usr/bin/env python3
"""Linux RTX 4050/6 GB launcher: diagnose, synthetic autotune, then user-run training.

No real manifest is generated. With --tune-only, no dataset is opened. Normal runs
validate the user's approved manifest before profiling. GPU candidates run one at a
time in disposable subprocesses. Selection maximizes measured synthetic throughput
within fixed memory limits; it does not promise highest accuracy or crash immunity.
"""
import argparse,fcntl,json,math,os,shutil,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ml'))
from raw_data import write_json,require
from resource_guard import available_ram

# This launcher uses the chosen CUDA Python for all actual model/manifest work.
# raw_data imports NumPy, so invoke the launcher through the supplied shell wrapper.
def environment():
    env=os.environ.copy();env.setdefault('CUDA_DEVICE_ORDER','PCI_BUS_ID')
    env.setdefault('CUBLAS_WORKSPACE_CONFIG',':4096:8')
    env.setdefault('PYTORCH_ALLOC_CONF','expandable_segments:True')
    env['PYTHONUNBUFFERED']='1';return env

def command_result(command,env,timeout=240):
    try:
        p=subprocess.run(command,capture_output=True,text=True,env=env,cwd=ROOT,timeout=timeout)
        return dict(exit_code=p.returncode,stdout=p.stdout,stderr=p.stderr)
    except subprocess.TimeoutExpired:
        return dict(exit_code=124,stdout='',stderr='Timed out; child terminated. No successful measurement.')

def doctor(python,env):
    probe=command_result([str(python),'-c',"import torch,json; print(json.dumps(dict(torch=str(torch.__version__),cuda=torch.version.cuda,available=torch.cuda.is_available(),devices=torch.cuda.device_count())))"],env,60)
    smi=command_result(['nvidia-smi','--query-gpu=name,uuid,driver_version,memory.total,memory.free,temperature.gpu','--format=csv'],env,30)
    return dict(cpu_threads_available=len(os.sched_getaffinity(0)),ram_available_gib=available_ram()/1024**3,
        disk_free_gib=shutil.disk_usage(ROOT).free/1024**3,python=str(python),torch=probe,nvidia_smi=smi)

def select_candidate(candidates):
    safe=[r for r in candidates if r.get('status')=='passed' and r['peakReservedBytes']<=r['limitReservedBytes']*.85
          and r['minimumObservedOrConservativeHeadroomBytes']>=r['requiredHeadroomBytes']+.25*1024**3]
    require(safe,'No candidate passes the safety margin; close GPU applications or lower the window in a new reviewed experiment')
    fastest=max(r['samplesPerSecond'] for r in safe)
    # Prefer less memory/CPU contention when throughput is within measurement noise (5%).
    return min((r for r in safe if r['samplesPerSecond']>=fastest*.95),key=lambda r:(r['peakReservedBytes'],r['cpuThreads'],r['microbatch']))

def tune(python,c,out,effective,max_micro,env):
    results=[];threads=min(4,max(1,len(os.sched_getaffinity(0))-2))
    def measure(micro,threads,smoke=False):
        pc=dict(schema='navdr.ml-config.v1',seed=c['seed'],window=c['window'],microbatch=micro,
            accumulation=1 if smoke else effective//micro,steps=3,learning_rate=c['learning_rate'],target_scale_mps=c['target_scale_mps'])
        label='smoke' if smoke else f'm{micro}-t{threads}';path=out/(label+'.json');write_json(path,pc)
        command=[str(python),str(ROOT/'ml/memory_probe.py'),'--config',str(path),'--reserved-gib',str(c['reserved_gib']),
                 '--headroom-gib',str(c['headroom_gib']),'--cpu-threads',str(threads),'--steps','3' if smoke else '5']
        raw=command_result(command,env,240);write_json(out/(label+'.raw.json'),raw)
        try:r=json.loads(raw['stdout'].strip().splitlines()[-1])
        except (ValueError,IndexError):r=dict(status='failed',error=raw['stderr'])
        if raw['exit_code']!=0:r['status']='failed'
        print(json.dumps(dict(event='probe',candidate=label,result=r)),flush=True)
        return r
    first=measure(1,threads,True);require(first.get('status')=='passed','Microbatch-1 GPU probe failed. See smoke.raw.json; training was not started')
    micro=1
    while micro<=min(max_micro,effective):
        if effective%micro==0:
            r=measure(micro,threads);results.append(r)
            if r.get('status')!='passed':break
        micro*=2
    best=select_candidate(results)
    for count in sorted({2,min(8,max(1,len(os.sched_getaffinity(0))-2))}-{threads}):
        r=measure(best['microbatch'],count);results.append(r)
    best=select_candidate(results)
    c.update(microbatch=best['microbatch'],accumulation=effective//best['microbatch'],cpu_threads=best['cpuThreads'])
    write_json(out/'tuning.json',dict(synthetic_only=True,selection_rule='within 5% of fastest, then least reserved memory/CPU threads',candidates=results,selected=best))
    write_json(out/'selected-config.json',c)
    print(json.dumps(dict(event='selected',config=c,synthetic_samples_per_second=best['samplesPerSecond'],peak_reserved_gib=best['peakReservedBytes']/1024**3)),flush=True)
    return c

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check',action='store_true');p.add_argument('--tune-only',action='store_true');p.add_argument('--resume',action='store_true')
    p.add_argument('--split-manifest',type=Path);p.add_argument('--run-dir',type=Path)
    p.add_argument('--model-config',type=Path,default=ROOT/'ml/configs/training-v2.json')
    p.add_argument('--use-config',type=Path,help='Reuse a measured selected-config.json; fresh safety probes still run before training')
    p.add_argument('--python',type=Path,default=Path(sys.executable));p.add_argument('--epochs',type=int)
    p.add_argument('--effective-batch',type=int,default=128);p.add_argument('--max-microbatch',type=int,default=128)
    p.add_argument('--resume-microbatch',type=int,help='Explicit smaller-microbatch recovery; preserve effective batch and optimizer state')
    p.add_argument('--ram-headroom-gib',type=float,default=2.);a=p.parse_args();env=environment();python=a.python.absolute()
    try:
        if a.check:
            d=doctor(python,env);print(json.dumps(d,indent=2))
            require(d['nvidia_smi']['exit_code']==0 and d['torch']['exit_code']==0,'GPU driver/environment check failed')
            require(json.loads(d['torch']['stdout'])['available'],'Selected Python has no available CUDA');return
        require(a.run_dir is not None,'--run-dir is required')
        require(not(a.resume and a.tune_only),'Resume and tune-only are mutually exclusive')
        require(a.use_config is None or not(a.resume or a.tune_only),'--use-config is for a new training run only')
        require(a.resume or a.resume_microbatch is None,'--resume-microbatch requires --resume')
        require(a.tune_only or a.split_manifest is not None,'--split-manifest is required; the launcher never creates approvals')
        require(not(a.tune_only and a.split_manifest),'Tune-only does not take or open a real manifest')
        require(1<=a.max_microbatch<=256 and a.effective_batch>0 and a.effective_batch<=4096,'Microbatch <=256 and effective batch 1..4096 required')
        require(math.isfinite(a.ram_headroom_gib) and a.ram_headroom_gib>=1,'Keep at least 1 GiB host RAM headroom')
        if not a.tune_only:
            # Only structural approval/path/hash declarations, never train here.
            validation=command_result([str(python),'-c',"import sys; sys.path.insert(0,'ml'); from raw_data import read_manifest; print(read_manifest(sys.argv[1])[1])",str(a.split_manifest.resolve())],env)
            require(validation['exit_code']==0,'Manifest refused: '+validation['stderr'])
        out=a.run_dir.resolve();require(a.resume or not out.exists(),'Run directory exists; use --resume or a new directory');out.mkdir(parents=True,exist_ok=True)
        lockpath=ROOT/'.local-tools/navdr-gpu.lock';lockpath.parent.mkdir(exist_ok=True)
        with lockpath.open('a') as lock:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:raise ValueError('Another NavDR GPU launcher holds the lock; run one job at a time') from None
            d=doctor(python,env);write_json(out/'hardware.json',d)
            require(d['nvidia_smi']['exit_code']==0 and d['torch']['exit_code']==0 and json.loads(d['torch']['stdout'])['available'],'CUDA check failed; inspect hardware.json')
            require(d['ram_available_gib']>=a.ram_headroom_gib+1,'Less than requested host headroom plus 1 GiB available; close RAM-heavy applications')
            require(d['disk_free_gib']>=2,'Less than 2 GiB disk free')
            if a.resume:
                cfg=out/'selected-config.json';require(cfg.is_file() and (out/'model.pt').is_file(),'Resume needs selected-config.json and model.pt')
                if a.resume_microbatch is not None:
                    c=json.loads(cfg.read_text());effective=c['microbatch']*c['accumulation']
                    require(1<=a.resume_microbatch<=c['microbatch'] and effective%a.resume_microbatch==0,'Recovery microbatch must be smaller and divide effective batch')
                    c.update(microbatch=a.resume_microbatch,accumulation=effective//a.resume_microbatch)
                    write_json(out/'before-rebatch-config.json',json.loads(cfg.read_text()));write_json(cfg,c)
            else:
                # Resolve config with the chosen environment; enforce the existing 6 GB safety budget.
                from training_runner import resolve_config
                base=argparse.Namespace(model_config=a.use_config or a.model_config);c=resolve_config(base)
                c.update(reserved_gib=4.,headroom_gib=1.,checkpoint_every_updates=10,ram_headroom_gib=a.ram_headroom_gib)
                if a.epochs is not None:require(a.epochs>0,'Epochs must be positive');c['epochs']=a.epochs
                if a.use_config:write_json(out/'selected-config.json',c)
                else:tune(python,c,out,a.effective_batch,a.max_microbatch,env)
                cfg=out/'selected-config.json'
            if a.tune_only:return
            command=[str(python),str(ROOT/'ml/train.py'),'--split-manifest',str(a.split_manifest.resolve()),'--model-config',str(cfg),'--device','cuda','--checkpoint',str(out/'model.pt')]
            if a.resume:
                command+=['--resume-from-checkpoint',str(out/'model.pt'),'--allow-rebatch']
                if a.epochs is not None:command+=['--epochs',str(a.epochs)]
            write_json(out/'launch-command.json',command)
            # Child inherits the lock fd so killing just the wrapper cannot start a second training job.
            with (out/'console.log').open('a',buffering=1) as log:
                child=subprocess.Popen(command,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,pass_fds=(lock.fileno(),))
                try:
                    for line in child.stdout:print(line,end='',flush=True);log.write(line)
                    code=child.wait()
                except KeyboardInterrupt:
                    child.terminate();child.wait();raise
            write_json(out/'launch-status.json',dict(exit_code=code,checkpoint_exists=(out/'model.pt').exists(),real_training_requested=True))
            if code==75:print('Resource pause: free RAM/VRAM/disk, then rerun the same command with --resume.',file=sys.stderr)
            elif code:print('Run stopped. Read console.log and model.run.jsonl; latest complete model.pt is preserved. Do not blindly retry driver or data errors.',file=sys.stderr)
            raise SystemExit(code)
    except (Exception,KeyboardInterrupt) as e:
        p.exit(1,type(e).__name__+': '+str(e)+'\n')

if __name__=='__main__':main()
