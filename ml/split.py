"""DRAFT whole-trip connected-component split; never declares human approval."""
import argparse,hashlib,random
from pathlib import Path
from common import read,write,digest

def split(source,seed=26168):
    data=read(source);trips=data['trips'];ids=[t['id'] for t in trips]
    if len(ids)!=len(set(ids)):raise ValueError('Duplicate trip ID')
    if not trips:raise ValueError('No trips')
    parent=list(range(len(trips)));seen={};warnings=[]
    def root(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for i,t in enumerate(trips):
        for key in ('vehicle','phone','route'):
            value=t.get(key)
            if value is None:warnings.append(f'{t["id"]}: missing {key}; separation cannot be certified');continue
            token=(key,str(value))
            if token in seen:parent[root(i)]=root(seen[token])
            seen[token]=i
    groups={}
    for i,t in enumerate(trips):groups.setdefault(root(i),[]).append(t)
    groups=sorted(groups.values(),key=lambda g:sorted(t['id'] for t in g));random.Random(seed).shuffle(groups)
    if len(groups)<3:raise ValueError('Fewer than three independent connected groups; ask user to revise grouping or collect more trips')
    n=len(groups);n_test=max(1,round(.2*n));n_dev=max(1,round(.2*n));result=[]
    for i,group in enumerate(groups):
        role='test' if i<n_test else 'dev' if i<n_test+n_dev else 'train'
        for t in group:
            path=(Path(source).parent/t['path']).resolve()
            result.append({**t,'path':str(path),'sha256':digest(path),'split':role,'group':'|'.join(sorted(x['id'] for x in group))})
    return dict(schema='navdr.split.v1',status='DRAFT_REQUIRES_USER_REVIEW',synthetic=data.get('synthetic') is True,
        sourceSha256=digest(source),seed=seed,grouping='connected components sharing any known vehicle OR phone OR route',warnings=warnings,trips=result)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('inventory',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    write(a.output,split(a.inventory));print(a.output.read_text())
