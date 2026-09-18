"""User-operated training entry point. Agent acceptance uses --toy on CPU only."""
import argparse,json,platform,subprocess,sys
from pathlib import Path
import torch
from torch.utils.data import DataLoader
from common import config,read,digest
from dataset import Windows
from model import NavDRTCN

def train(data,cfg,out,toy=False,approval=None,device='cpu'):
    c=config(cfg);meta=read(data/'manifest.json')
    if not (toy and meta.get('synthetic') is True) and approval!=meta['manifestSha256']:raise ValueError('STOP: user-reviewed split SHA256 required')
    if out.exists():raise ValueError('Checkpoint already exists')
    if device=='cuda':subprocess.run([sys.executable,str(Path(__file__).with_name('memory_probe.py')),'--config',str(cfg)],check=True)
    torch.set_num_threads(2);torch.manual_seed(c['seed'])
    model=NavDRTCN().to(device);opt=torch.optim.Adam(model.parameters(),lr=c['learning_rate'])
    dataset=Windows(data,'train',c['window'],c['period_ns']);loader=DataLoader(dataset,batch_size=c['microbatch'],shuffle=True,num_workers=0)
    iterator=iter(loader)
    for _ in range(c['steps']):
        opt.zero_grad(set_to_none=True)
        for _ in range(c['accumulation']):
            try:x,y=next(iterator)
            except StopIteration:iterator=iter(loader);x,y=next(iterator)
            if y.abs().max().item()>c['target_scale_mps']:raise ValueError('Speed label outside configured tanh target scale; review target contract')
            loss=torch.nn.functional.mse_loss(model(x.to(device)),y.to(device)/c['target_scale_mps'])/c['accumulation']
            if not torch.isfinite(loss):raise ValueError('Nonfinite training step')
            loss.backward()
        opt.step()
    metadata=dict(schema='navdr.checkpoint.v1',config=c,configSha256=digest(cfg),manifestSha256=meta['manifestSha256'],
        normalization=meta['normalization'],synthetic=meta['synthetic'],steps=c['steps'],torch=str(torch.__version__),python=platform.python_version(),
        modelSourceSha256=digest(Path(__file__).with_name('model.py')),purpose='toy correctness' if toy else 'user experiment')
    out.parent.mkdir(parents=True,exist_ok=True);torch.save(dict(state_dict=model.cpu().state_dict(),optimizer=opt.state_dict(),metadata=metadata),out)
    print(json.dumps({'status':'completed','synthetic':meta['synthetic'],'optimizerSteps':c['steps'],'checkpoint':str(out),'realDataTraining':False if toy else True}))
if __name__ == "__main__":
    from training_runner import main
    main()
