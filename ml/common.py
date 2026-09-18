import hashlib,json
from pathlib import Path

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(Path(path).read_text())
def write(path,value):
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')
def config(path):
    c=read(path)
    if c.get('schema')!='navdr.ml-config.v1':raise ValueError('Unsupported config schema')
    for k in ('window','microbatch','accumulation','steps','seed'):
        if type(c.get(k)) is not int or c[k]<(0 if k=='seed' else 1):raise ValueError('Invalid '+k)
    if c['window']>1000 or c['microbatch']>256:raise ValueError('Maximum supported probe shape: window 1000, microbatch 256')
    if not isinstance(c.get('target_scale_mps'), (int,float)) or c['target_scale_mps']<=0:raise ValueError('Explicit positive target scale required')
    return c
