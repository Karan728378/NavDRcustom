"""CPU-only canonical CSV preprocessing. No IO-VNBD interpretation or pairing decisions."""
import argparse,csv
from pathlib import Path
import numpy as np
from common import read,write,digest
CHANNELS=['ax','ay','az','gx','gy','gz']

def resolve_trip_path(manifest_path, trip_path):
    p = Path(trip_path)
    if p.is_file():
        return p
    mp = Path(manifest_path).resolve().parent / trip_path
    if mp.is_file():
        return mp
    rp = Path(__file__).resolve().parents[1] / trip_path
    if rp.is_file():
        return rp
    raise FileNotFoundError(f'Canonical trip CSV not found: {trip_path}')

def load_csv(path):
    p = Path(path)
    if not p.is_file():
        p = Path(__file__).resolve().parents[1] / path
    with p.open() as f: rows=list(csv.DictReader(f))
    a=np.array([[float(r[k]) for k in ['timestampNs',*CHANNELS,'speedMps']] for r in rows],dtype=np.float64)
    if a.ndim!=2 or a.shape[1]!=8 or len(a)<2 or not np.isfinite(a).all() or (np.diff(a[:,0])<=0).any():raise ValueError('Invalid canonical trip')
    return a

def prepare(manifest,out,toy=False,approval=None):
    m=read(manifest);h=digest(manifest)
    if m.get('schema')!='navdr.split.v1':raise ValueError('Invalid split schema')
    if not (toy and m.get('synthetic') is True) and approval!=h:raise ValueError('STOP: human-reviewed manifest SHA256 required; draft is not approved')
    if out.exists():raise ValueError('Choose a new output directory')
    # Verify grouping even for edited manifests; connected identifiers cannot cross splits.
    assignments={};ids=set()
    groups={'train':set(),'dev':set(),'test':set()}
    resolved_paths={}
    for t in m['trips']:
        if t['id'] in ids or t['split'] not in ('train','dev','test'):raise ValueError('Invalid trip/split')
        ids.add(t['id'])
        rg=t.get('recording_group') or t.get('group')
        if rg:
            groups[t['split']].add(str(rg))
        for k in ('recording_group','group','vehicle','phone','route'):
            if t.get(k) is not None:
                token=(k,str(t[k]));prior=assignments.setdefault(token,t['split'])
                if prior!=t['split']:raise ValueError('Group leakage: '+str(token))
        actual_file=resolve_trip_path(manifest, t['path'])
        resolved_paths[t['id']]=actual_file
        if digest(actual_file)!=t['sha256']:raise ValueError('Trip hash changed: '+t['id'])
    if groups['train'] & groups['test']:
        raise ValueError(f'Train/test recording_group leakage: {groups["train"] & groups["test"]}')
    if groups['train'] & groups['dev']:
        raise ValueError(f'Train/dev recording_group leakage: {groups["train"] & groups["dev"]}')
    if groups['dev'] & groups['test']:
        raise ValueError(f'Dev/test recording_group leakage: {groups["dev"] & groups["test"]}')
    # Welford-style merged statistics use only training trips, before overlapping windows.
    n=0;mean=np.zeros(6);ss=np.zeros(6)
    for t in m['trips']:
        if t['split']!='train':continue
        x=load_csv(resolved_paths[t['id']])[:,1:7];count=len(x);mu=x.mean(0);delta=mu-mean
        ss+=((x-mu)**2).sum(0)+delta**2*n*count/(n+count);mean+=delta*count/(n+count);n+=count
    if n<2:raise ValueError('No usable training samples')
    std=np.maximum(np.sqrt(ss/n),1e-6);out.mkdir(parents=True)
    trips=[]
    for i,t in enumerate(m['trips']):
        a=load_csv(resolved_paths[t['id']]);a[:,1:7]=(a[:,1:7]-mean)/std
        name=f'trip-{i:04d}.npy';np.save(out/name,a);trips.append({**t,'array':name})
    result=dict(schema='navdr.prepared.v1',synthetic=m.get('synthetic') is True,manifestSha256=h,
        approval='toy-only exemption' if toy else approval,normalization=dict(mean=mean.tolist(),std=std.tolist(),trainingRows=n,fitTripIds=[t['id'] for t in m['trips'] if t['split']=='train']),trips=trips)
    write(out/'manifest.json',result);return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest',type=Path);p.add_argument('output',type=Path);p.add_argument('--toy',action='store_true');p.add_argument('--approved-manifest-sha256');a=p.parse_args()
    prepare(a.manifest,a.output,a.toy,a.approved_manifest_sha256);print(a.output/'manifest.json')
