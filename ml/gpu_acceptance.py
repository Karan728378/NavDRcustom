"""Small synthetic acceptance for resource recovery and real CUDA execution.
No IO-VNBD reads, real approvals, production architecture choices or accuracy claims.
"""
import argparse,json,os,sys
from pathlib import Path
from unittest.mock import patch
import torch
from raw_data import write_json,require
from self_test import fixture
from training_runner import DEFAULT,train_run
from resource_guard import ResourcePause
from gpu_train import select_candidate


def run(out,device,config_path=None):
    out=Path(out).resolve();require(not out.exists(),'Choose a new acceptance directory');out.mkdir(parents=True)
    def guard(event,args):
        if event=='open' and isinstance(args[0],str) and 'IO-VNBD-master' in Path(args[0]).parts:raise AssertionError('Real dataset access forbidden')
    sys.addaudithook(guard)
    manifest=fixture(out/'fixtures')
    c={**DEFAULT,'epochs':1,'microbatch':4,'accumulation':4,'checkpoint_every_updates':1}
    if config_path:c.update(json.loads(Path(config_path).read_text()));c['epochs']=1;c['checkpoint_every_updates']=1
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG',':4096:8')
    full=train_run(manifest,c,out/'full/model.pt',device=device,synthetic=True)
    interrupted=train_run(manifest,c,out/'resume/model.pt',device=device,synthetic=True,max_updates=1)
    train_run(manifest,c,interrupted,device=device,synthetic=True,resume=interrupted)
    a=torch.load(full,map_location='cpu',weights_only=True);b=torch.load(interrupted,map_location='cpu',weights_only=True)
    assert a['history']==b['history'] and all(torch.equal(a['state_dict'][k],b['state_dict'][k]) for k in a['state_dict'])
    # Explicit re-batching: optimizer progress retained and effective batch unchanged.
    half=max(1,c['microbatch']//2);effective=c['microbatch']*c['accumulation']
    recovery=train_run(manifest,c,out/'rebatch/model.pt',device=device,synthetic=True,max_updates=1)
    smaller={**c,'microbatch':half,'accumulation':effective//half}
    train_run(manifest,smaller,recovery,device=device,synthetic=True,resume=recovery,allow_rebatch=True)
    r=torch.load(recovery,map_location='cpu',weights_only=True)
    assert r['epoch']==1 and r['updates']==a['updates'] and r['config']['microbatch']==half
    assert all(torch.isfinite(v).all() for v in r['state_dict'].values())
    # Bad re-batching cannot change effective batch silently.
    try:
        train_run(manifest,{**smaller,'accumulation':smaller['accumulation']+1},out/'bad/model.pt',device=device,synthetic=True,resume=recovery,allow_rebatch=True)
        raise AssertionError('Changed effective batch accepted')
    except ValueError as e:assert 'effective batch' in str(e)
    calls=0
    def low_ram(*args,**kwargs):
        nonlocal calls
        calls+=1
        # Two source-trip preflights, one successful optimizer group, then pressure.
        if calls==4:raise ResourcePause('TEST ONLY: injected low host RAM')
    try:
        with patch('training_runner.check_host',side_effect=low_ram):
            train_run(manifest,c,out/'pressure/model.pt',device=device,synthetic=True)
        raise AssertionError('Resource pause not raised')
    except ResourcePause:pass
    paused=torch.load(out/'pressure/model.pt',map_location='cpu',weights_only=True)
    assert paused['updates']==1 and paused['cursor']==min(effective,171)
    train_run(manifest,c,out/'pressure/model.pt',device=device,synthetic=True,resume=out/'pressure/model.pt')
    resumed=torch.load(out/'pressure/model.pt',map_location='cpu',weights_only=True)
    assert all(torch.equal(a['state_dict'][k],resumed['state_dict'][k]) for k in a['state_dict'])
    try:select_candidate([dict(status='failed')]);raise AssertionError('Failed probe accepted')
    except ValueError:pass
    result=dict(status='PASS',device=device,synthetic_only=True,real_data_touched=False,real_manifest_created=False,
        completed_epochs=1,updates=a['updates'],microbatch=c['microbatch'],effective_batch=effective,
        identical_resume=True,smaller_microbatch_recovery=True,resource_pause_checkpoint_recovery=True,
        failed_probe_refused=True,mixed_precision='disabled',cuda_version=torch.version.cuda,
        torch_version=str(torch.__version__))
    write_json(out/'acceptance.json',result);print(json.dumps(result,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--device',choices=('cpu','cuda'),default='cpu');p.add_argument('--model-config',type=Path);a=p.parse_args();run(a.output_dir,a.device,a.model_config)
