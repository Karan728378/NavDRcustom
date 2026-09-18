"""Reproducible FP32 epoch training, durable logs, atomic checkpoints and exact CPU resume.

Checkpoints are at optimizer boundaries, so no partial gradient state is discarded.
On interruption resume repeats at most checkpoint_every_updates-1 completed updates.
No AMP: it has not been validated. Accumulation weights each microbatch by sample count.
"""
import argparse, hashlib, json, os, platform, subprocess, sys, time
from collections import OrderedDict
from pathlib import Path
import numpy as np
import torch
from model import NavDRTCN
from resource_guard import check_host, ResourcePause
from raw_data import read_manifest, load_trip, require, sha, write_json, finite_number

ROOT=Path(__file__).resolve().parents[1]
DEFAULT=dict(schema='navdr.training.v2',model='existing-tcn-49665',seed=26168,window=231,
    period_seconds=.1,microbatch=1,accumulation=1,learning_rate=.001,epochs=10,
    target_scale_mps=60.,checkpoint_every_updates=100,reserved_gib=4.,headroom_gib=1.,cpu_threads=2,ram_headroom_gib=0.)

def confighash(c):
    return hashlib.sha256(json.dumps(c,sort_keys=True,allow_nan=False).encode()).hexdigest()

def resolve_config(args):
    c=DEFAULT.copy()
    if args.model_config:
        with Path(args.model_config).open() as f: supplied=json.load(f)
        require(isinstance(supplied,dict) and not(set(supplied)-set(DEFAULT)), 'Unknown config keys; use navdr.training.v2')
        c.update(supplied)
    for k in DEFAULT:
        value=getattr(args,k,None)
        if value is not None:c[k]=value
    require(c['schema']=='navdr.training.v2' and c['model']=='existing-tcn-49665','Unsupported architecture/config schema')
    for k in ('seed','window','microbatch','accumulation','epochs','checkpoint_every_updates','cpu_threads'):
        require(type(c[k]) is int and c[k]>=(0 if k=='seed' else 1),'Invalid config '+k)
    for k in ('period_seconds','learning_rate','target_scale_mps','reserved_gib','headroom_gib'):
        require(finite_number(c[k]) and c[k]>0,'Invalid config '+k)
    require(c['window']<=1000 and c['microbatch']<=256 and c['cpu_threads']<=64,'Limits: window <=1000, microbatch <=256, CPU threads <=64')
    require(finite_number(c['ram_headroom_gib']) and c['ram_headroom_gib']>=0,'Invalid RAM headroom')
    return c

class WindowData:
    """At most two arrays mapped; window index is host RAM, never GPU residency."""
    def __init__(self,files,window):
        self.files=files;self.window=window;self.index=[];self.cache=OrderedDict()
        for i,file in enumerate(files):
            a=np.load(file,mmap_mode='r')
            ends=np.flatnonzero(np.isfinite(a[window-1:,6]))+window-1
            self.index.append(np.column_stack((np.full(len(ends),i,dtype=np.int64),ends)))
        self.index=np.concatenate(self.index) if self.index else np.empty((0,2),dtype=np.int64)
        require(len(self.index)>0,'No labeled windows; inspect cadence, alignment and window size')
    def batch(self,indices,mean,std):
        xs=[];ys=[]
        for index in indices:
            file,end=self.index[int(index)]
            if file not in self.cache:
                self.cache[file]=np.load(self.files[file],mmap_mode='r')
                if len(self.cache)>2:self.cache.popitem(last=False)
            a=self.cache[file];xs.append(((a[end-self.window+1:end+1,:6]-mean)/std).T);ys.append([a[end,6]])
        return torch.tensor(np.array(xs),dtype=torch.float32),torch.tensor(np.array(ys),dtype=torch.float32)

def log_event(path,**event):
    event['utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    line=json.dumps(event,allow_nan=False)
    with Path(path).open('a') as f:f.write(line+'\n');f.flush();os.fsync(f.fileno())
    print(line,flush=True)

def gpu_probe(c,out,log):
    """Parent has not called CUDA before both isolated probes finish."""
    for microbatch in sorted({1,c['microbatch']}):
        probe=dict(schema='navdr.ml-config.v1',seed=c['seed'],window=c['window'],microbatch=microbatch,
            accumulation=c['accumulation'],steps=3,learning_rate=c['learning_rate'],target_scale_mps=c['target_scale_mps'])
        cfg=out/f'probe-config-m{microbatch}.json';write_json(cfg,probe)
        command=[sys.executable,str(ROOT/'ml/memory_probe.py'),'--config',str(cfg),
                 '--reserved-gib',str(c['reserved_gib']),'--headroom-gib',str(c['headroom_gib']),'--cpu-threads',str(c.get('cpu_threads',2))]
        proc=subprocess.run(command,capture_output=True,text=True)
        (out/f'probe-m{microbatch}.log').write_text(proc.stdout+proc.stderr)
        log_event(log,event='gpu_probe',microbatch=microbatch,exit_code=proc.returncode,stdout=proc.stdout,stderr=proc.stderr)
        require(proc.returncode==0,'GPU probe blocked/failed; no real CUDA training allocation made. See probe log.')
    free,total=torch.cuda.mem_get_info();budget=min(c['reserved_gib']*1024**3,free-c['headroom_gib']*1024**3)
    require(budget>0,'GPU free memory changed after probe')
    torch.cuda.set_per_process_memory_fraction(budget/total)

def train_run(manifest_path,c,checkpoint,device='cpu',resume=None,synthetic=False,max_updates=None,allow_rebatch=False):
    manifest,mhash=read_manifest(manifest_path,synthetic)
    checkpoint=Path(checkpoint).resolve();out=checkpoint.parent
    require(resume is not None or not checkpoint.exists(),'Checkpoint exists; use --resume-from-checkpoint or a new directory')
    out.mkdir(parents=True,exist_ok=True);log=out/(checkpoint.stem+'.run.jsonl')
    require(resume is not None or not log.exists(),'Run log already exists; use a fresh checkpoint name/directory')
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG',':4096:8')
    torch.set_num_threads(c.get('cpu_threads',2));torch.use_deterministic_algorithms(True);torch.manual_seed(c['seed'])
    modelhash=sha(ROOT/'ml/model.py');pipelinehash=confighash({p:sha(ROOT/'ml'/p) for p in ('raw_data.py','training_runner.py','resource_guard.py')})
    old=torch.load(resume,map_location='cpu',weights_only=True) if resume else None
    if old:
        require(old.get('schema')=='navdr.training-checkpoint.v2','Unsupported checkpoint')
        for key,value in [('manifest_sha256',mhash),('model_source_sha256',modelhash),('pipeline_sha256',pipelinehash),('synthetic',synthetic),('device',device)]:
            require(old[key]==value,'Resume mismatch: '+key)
        require(old['torch_version']==str(torch.__version__),'Resume requires the same Torch version')
        ignored={'epochs'}
        if allow_rebatch:
            require(c['microbatch']<=old['config']['microbatch'],'Recovery only permits a smaller microbatch')
            require(c['microbatch']*c['accumulation']==old['config']['microbatch']*old['config']['accumulation'],'Recovery must preserve effective batch size')
            ignored|={'microbatch','accumulation'}
        comparable=lambda cfg:{k:v for k,v in cfg.items() if k not in ignored}
        require(comparable(old['config'])==comparable(c),'Resume config mismatch; only total epochs may change')
        require(c['epochs']>=old['epoch'],'Total epochs precede saved progress')
    log_event(log,event='start' if not old else 'resume',seed=c['seed'],config=c,config_sha256=confighash(c),manifest_sha256=mhash,
        synthetic=synthetic,device=device,model_source_sha256=modelhash,pipeline_sha256=pipelinehash,
        torch=str(torch.__version__),numpy=np.__version__,python=platform.python_version(),argv=sys.argv,allow_rebatch=allow_rebatch)
    write_json(out/(checkpoint.stem+'.config.json'),c)
    if device=='cuda':gpu_probe(c,out,log)
    files={'train':[],'dev':[]};n=0;mean=np.zeros(6);ss=np.zeros(6)
    cache=out/(checkpoint.stem+'.prepared');cache.mkdir(exist_ok=True)
    # Do not load/hash/parse test file contents during training. Manifest paths and declared hashes were validated above.
    for i,t in enumerate(manifest['trips']):
        if t['split'] not in files:continue
        source_bytes=sum(Path(t[k]['_path']).stat().st_size for k in ('phone','vehicle'))
        check_host(out,c.get('ram_headroom_gib',0),source_bytes*12,source_bytes*2)
        data=load_trip(t,c['period_seconds']);x=data['x'];y=data['y']
        require(np.isfinite(y).any(),'No aligned speed labels: '+t['id'])
        require(np.nanmin(y)>=0 and np.nanmax(y)<=c['target_scale_mps'],'Speed labels outside approved nonnegative target scale')
        path=cache/f'{i:04d}.npy';np.save(path,np.column_stack((x,y)));files[t['split']].append(path)
        if t['split']=='train':
            count=len(x);mu=x.mean(0);delta=mu-mean;ss+=((x-mu)**2).sum(0)+delta**2*n*count/(n+count);mean+=delta*count/(n+count);n+=count
        log_event(log,event='parsed_trip',trip=t['id'],split=t['split'],rows=len(x),aligned_labels=int(np.isfinite(y).sum()))
    require(n>1,'Insufficient training rows');std=np.maximum(np.sqrt(ss/n),1e-6)
    normalization=dict(mean=mean.tolist(),std=std.tolist(),training_rows=n,trip_ids=[t['id'] for t in manifest['trips'] if t['split']=='train'])
    if old:require(old['normalization']==normalization,'Resume normalization mismatch')
    train=WindowData(files['train'],c['window']);dev=WindowData(files['dev'],c['window'])
    model=NavDRTCN().to(device);opt=torch.optim.Adam(model.parameters(),lr=c['learning_rate'])
    epoch=0;cursor=0;updates=0;loss_sum=0.;seen=0;history=[]
    if old:
        model.load_state_dict(old['state_dict']);opt.load_state_dict(old['optimizer']);epoch=old['epoch'];cursor=old['cursor'];updates=old['updates'];loss_sum=old['loss_sum'];seen=old['seen'];history=old['history'];torch.set_rng_state(old['rng_cpu'])
    def save():
        state=dict(schema='navdr.training-checkpoint.v2',state_dict=model.state_dict(),optimizer=opt.state_dict(),config=c,
            config_sha256=confighash(c),manifest_sha256=mhash,normalization=normalization,synthetic=synthetic,
            model_source_sha256=modelhash,pipeline_sha256=pipelinehash,torch_version=str(torch.__version__),device=device,
            epoch=epoch,cursor=cursor,updates=updates,loss_sum=loss_sum,seen=seen,history=history,rng_cpu=torch.get_rng_state())
        temp=checkpoint.with_name(checkpoint.name+'.tmp')
        with temp.open('wb') as f:torch.save(state,f);f.flush();os.fsync(f.fileno())
        temp.replace(checkpoint)
    save() # Initial/restored atomic checkpoint exists before any optimizer update.
    effective=c['microbatch']*c['accumulation'];run_updates=0
    while epoch<c['epochs']:
        model.train();permutation=np.random.default_rng(c['seed']+epoch).permutation(len(train.index))
        while cursor<len(permutation):
            try:
                check_host(out,c.get('ram_headroom_gib',0))
                if device=='cuda' and torch.cuda.mem_get_info()[0]<c['headroom_gib']*1024**3:raise ResourcePause('GPU free headroom fell below budget')
            except ResourcePause:
                save();raise
            indices=permutation[cursor:cursor+effective];opt.zero_grad(set_to_none=True)
            for start in range(0,len(indices),c['microbatch']):
                batch=indices[start:start+c['microbatch']];x,y=train.batch(batch,mean,std)
                if device=='cuda':x=x.pin_memory();y=y.pin_memory()
                pred=model(x.to(device,non_blocking=device=='cuda'));loss=torch.nn.functional.mse_loss(pred,y.to(device,non_blocking=device=='cuda')/c['target_scale_mps'],reduction='sum')
                require(torch.isfinite(loss).item(),'Nonfinite training loss');(loss/len(indices)).backward()
                loss_sum+=loss.item();seen+=len(batch)
            require(torch.stack([torch.isfinite(p.grad).all() for p in model.parameters() if p.grad is not None]).all().item(),'Nonfinite gradients')
            opt.step();cursor+=len(indices);updates+=1;run_updates+=1
            if device=='cuda':
                free,_=torch.cuda.mem_get_info()
                if free<c['headroom_gib']*1024**3 or torch.cuda.max_memory_reserved()>c['reserved_gib']*1024**3:
                    save();raise ResourcePause('GPU memory budget exceeded; paused at completed optimizer boundary')
            if updates%c['checkpoint_every_updates']==0:save()
            if max_updates is not None and run_updates>=max_updates:
                save();log_event(log,event='paused',epoch=epoch,cursor=cursor,updates=updates,checkpoint=str(checkpoint));return checkpoint
        model.eval();dev_sum=0.;dev_n=0
        with torch.inference_mode():
            for start in range(0,len(dev.index),c['microbatch']):
                x,y=dev.batch(range(start,min(start+c['microbatch'],len(dev.index))),mean,std)
                loss=torch.nn.functional.mse_loss(model(x.to(device)),y.to(device)/c['target_scale_mps'],reduction='sum')
                require(torch.isfinite(loss).item(),'Nonfinite dev loss');dev_sum+=loss.item();dev_n+=len(y)
        history.append(dict(epoch=epoch+1,train_normalized_mse=loss_sum/seen,dev_normalized_mse=dev_sum/dev_n,train_windows=seen,dev_windows=dev_n))
        epoch+=1;cursor=0;loss_sum=0.;seen=0;save();log_event(log,event='epoch_complete',**history[-1],updates=updates)
    save();log_event(log,event='completed',epochs=epoch,updates=updates,checkpoint=str(checkpoint),synthetic=synthetic)
    return checkpoint

def parser():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--split-manifest',type=Path);p.add_argument('--model-config',type=Path)
    p.add_argument('--checkpoint',type=Path);p.add_argument('--resume-from-checkpoint',type=Path)
    p.add_argument('--device',choices=('cpu','cuda'),default='cpu')
    for name in ('epochs','window','microbatch','accumulation','seed','checkpoint_every_updates','cpu_threads'):
        aliases=['--'+name.replace('_','-')]
        if name=='microbatch':aliases.append('--batch-size')
        if name=='window':aliases.append('--window-size')
        p.add_argument(*aliases,dest=name,type=int)
    for name in ('learning_rate','period_seconds','target_scale_mps','reserved_gib','headroom_gib','ram_headroom_gib'):
        p.add_argument('--'+name.replace('_','-'),type=float)
    p.add_argument('--max-updates',type=int,help='Cleanly pause after this many optimizer updates in this invocation')
    p.add_argument('--allow-rebatch',action='store_true',help='Resume with a smaller microbatch only, preserving effective batch; floating-point grouping may change')
    p.add_argument('--self-test',action='store_true');p.add_argument('--output-dir',type=Path)
    return p

def main():
    p=parser();a=p.parse_args()
    try:
        if a.self_test:
            require(not a.split_manifest and not a.resume_from_checkpoint and a.device=='cpu','Self-test is generated fixtures only, on CPU')
            require(a.output_dir is not None,'--self-test requires a NEW --output-dir')
            from self_test import run
            run(a.output_dir);return
        require(a.checkpoint is not None,'--checkpoint is required')
        require(a.max_updates is None or a.max_updates>0,'--max-updates must be positive')
        require(not a.allow_rebatch or a.resume_from_checkpoint is not None,'--allow-rebatch requires a checkpoint to resume')
        train_run(a.split_manifest,resolve_config(a),a.checkpoint,a.device,a.resume_from_checkpoint,max_updates=a.max_updates,allow_rebatch=a.allow_rebatch)
    except ResourcePause as e:
        if a.checkpoint and a.checkpoint.parent.exists():log_event(a.checkpoint.parent/(a.checkpoint.stem+'.run.jsonl'),event='resource_pause',error=str(e))
        p.exit(75,'Paused: '+str(e)+'; resume after freeing resources.\n')
    except Exception as e:
        if a.checkpoint and a.checkpoint.parent.exists():
            log_event(a.checkpoint.parent/(a.checkpoint.stem+'.run.jsonl'),event='failed',error=type(e).__name__+': '+str(e))
        p.exit(1,type(e).__name__+': '+str(e)+'\n')
