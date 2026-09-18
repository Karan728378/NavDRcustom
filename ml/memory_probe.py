"""Isolated FP32 GPU allocation/throughput test; no real dataset or approval needed.

Parent never imports Torch. A fresh child owns all CUDA allocations and exits after
synthetic forward/backward/Adam steps. Timings exclude two warm-up updates and include
CPU-to-GPU copies, finite-gradient checks and accumulation. Failed candidates are not
training successes. No AMP, overclocking, driver/power changes or unbounded retries.
"""
import argparse,json,os,subprocess,sys,time,statistics
from pathlib import Path
from common import config,digest
GIB=1024**3

def child(cfg,reserved_gib=4.,headroom_gib=1.,steps=3,cpu_threads=2):
    limit=reserved_gib*GIB;required=headroom_gib*GIB
    try:
        if not (0<reserved_gib<100000 and 0<headroom_gib<100000 and 3<=steps<=100 and 1<=cpu_threads<=64):raise ValueError('Invalid probe limits')
        c=config(cfg)
        import torch
        from model import NavDRTCN
        if not torch.cuda.is_available():raise RuntimeError('CUDA unavailable in installed PyTorch '+str(torch.__version__))
        torch.set_num_threads(cpu_threads);torch.manual_seed(c['seed']);torch.use_deterministic_algorithms(True)
        torch.backends.cudnn.benchmark=False
        free,total=torch.cuda.mem_get_info()
        if free<=required:raise RuntimeError('Insufficient free GPU headroom before allocation')
        torch.cuda.set_per_process_memory_fraction(min(limit,free-required)/total)
        torch.cuda.reset_peak_memory_stats();model=NavDRTCN().cuda();opt=torch.optim.Adam(model.parameters(),lr=c['learning_rate']);minimum=free
        xcpu=torch.randn(c['microbatch'],6,c['window']).pin_memory();ycpu=torch.zeros(c['microbatch'],1).pin_memory();timings=[]
        for step in range(steps+2):
            torch.cuda.synchronize();started=time.perf_counter();opt.zero_grad(set_to_none=True)
            for _ in range(c['accumulation']):
                x=xcpu.to('cuda',non_blocking=True);y=ycpu.to('cuda',non_blocking=True)
                loss=torch.nn.functional.mse_loss(model(x),y)/c['accumulation']
                if not torch.isfinite(loss).item():raise RuntimeError('Nonfinite probe loss')
                loss.backward()
            if not torch.stack([torch.isfinite(p.grad).all() for p in model.parameters() if p.grad is not None]).all().item():raise RuntimeError('Nonfinite probe gradients')
            opt.step();torch.cuda.synchronize();minimum=min(minimum,torch.cuda.mem_get_info()[0])
            if step>=2:timings.append(time.perf_counter()-started)
        peak=torch.cuda.max_memory_reserved();allocated=torch.cuda.max_memory_allocated();headroom=min(minimum,free-peak)
        ok=peak<=limit and headroom>=required
        result=dict(status='passed' if ok else 'failed_budget',synthetic=True,configSha256=digest(cfg),peakReservedBytes=peak,
            peakAllocatedBytes=allocated,minimumObservedOrConservativeHeadroomBytes=headroom,limitReservedBytes=limit,requiredHeadroomBytes=required,
            microbatch=c['microbatch'],accumulation=c['accumulation'],cpuThreads=cpu_threads,measuredUpdates=steps,
            medianUpdateSeconds=statistics.median(timings),samplesPerSecond=c['microbatch']*c['accumulation']/statistics.median(timings),
            gpuName=torch.cuda.get_device_name(),totalBytes=total,torchVersion=str(torch.__version__),cudaVersion=torch.version.cuda,
            precision='FP32',budgetVerified=ok)
        print(json.dumps(result));return 0 if ok else 1
    except Exception as e:
        print(json.dumps(dict(status='blocked_or_failed',synthetic=True,budgetVerified=False,error=type(e).__name__+': '+str(e),limitReservedBytes=limit,requiredHeadroomBytes=required)));return 2

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path,required=True);p.add_argument('--child',action='store_true')
    p.add_argument('--reserved-gib',type=float,default=4.);p.add_argument('--headroom-gib',type=float,default=1.);p.add_argument('--steps',type=int,default=3);p.add_argument('--cpu-threads',type=int,default=2);a=p.parse_args()
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG',':4096:8')
    if a.child:raise SystemExit(child(a.config,a.reserved_gib,a.headroom_gib,a.steps,a.cpu_threads))
    try:
        r=subprocess.run([sys.executable,__file__,'--child','--config',str(a.config),'--reserved-gib',str(a.reserved_gib),'--headroom-gib',str(a.headroom_gib),'--steps',str(a.steps),'--cpu-threads',str(a.cpu_threads)],capture_output=True,text=True,timeout=180)
        print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr);raise SystemExit(r.returncode)
    except subprocess.TimeoutExpired:print(json.dumps({'status':'failed_timeout','budgetVerified':False}));raise SystemExit(2)
