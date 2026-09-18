"""User-operated held-out velocity evaluation; not integrated navigation accuracy."""
import argparse,json
from pathlib import Path
import torch
from torch.utils.data import DataLoader
from common import read
from model import NavDRTCN
from dataset import Windows

def evaluate(data,checkpoint,split='dev'):
    torch.set_num_threads(2);ck=torch.load(checkpoint,map_location='cpu',weights_only=True);meta=read(data/'manifest.json')
    if ck['metadata']['manifestSha256']!=meta['manifestSha256']:raise ValueError('Checkpoint/data manifest mismatch')
    c=ck['metadata']['config'];model=NavDRTCN();model.load_state_dict(ck['state_dict']);model.eval();total=0.;n=0
    with torch.inference_mode():
        for x,y in DataLoader(Windows(data,split,c['window'],c['period_ns']),batch_size=1,num_workers=0):
            e=(model(x)*c['target_scale_mps']-y).abs()
            if not torch.isfinite(e).all():raise ValueError('Nonfinite output')
            total+=e.sum().item();n+=e.numel()
    return dict(split=split,windows=n,synthetic=meta['synthetic'],velocityMaeMps=total/n,purpose='toy correctness only' if meta['synthetic'] else 'user-run experiment')
if __name__ == "__main__":
    from evaluation_runner import main
    main()
