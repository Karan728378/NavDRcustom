#!/usr/bin/env python3
"""Hydrate CSV pointers from the public IO-VNBD Git LFS endpoint, with SHA256 verification.
Never overwrites modified local payloads; never downloads ZIP/image objects or trains.
"""
import argparse,concurrent.futures,hashlib,json,os,shutil,urllib.request,urllib.error
from pathlib import Path
ENDPOINT='https://github.com/onyekpeu/IO-VNBD.git/info/lfs/objects/batch'
PREFIX=b'version https://git-lfs.github.com/spec/v1'

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def batch(objects):
    request=urllib.request.Request(ENDPOINT,data=json.dumps({'operation':'download','transfers':['basic'],'objects':objects}).encode(),
        headers={'Accept':'application/vnd.git-lfs+json','Content-Type':'application/vnd.git-lfs+json'})
    with urllib.request.urlopen(request,timeout=45) as response:result=json.load(response)
    return {o['oid']:o for o in result['objects']}

def fetch(o,cache):
    oid=o['oid'];path=cache/oid;size=o['size']
    if path.exists() and path.stat().st_size==size and sha(path)==oid:return path
    if 'error' in o:raise RuntimeError(f"LFS object unavailable: code {o['error'].get('code')}")
    action=o['actions']['download']
    if not action['href'].startswith('https://'):raise RuntimeError('Refusing non-HTTPS transfer')
    temp=cache/(oid+'.partial')
    for attempt in range(2):
        try:
            h=hashlib.sha256();count=0
            request=urllib.request.Request(action['href'],headers=action.get('header',{}))
            with urllib.request.urlopen(request,timeout=60) as response,temp.open('wb') as out:
                while chunk:=response.read(1024*1024):
                    count+=len(chunk)
                    if count>size:raise RuntimeError('Payload larger than pointer declaration')
                    out.write(chunk);h.update(chunk)
            if count!=size or h.hexdigest()!=oid:raise RuntimeError('Payload size/SHA256 mismatch')
            temp.replace(path);return path
        except (TimeoutError,urllib.error.URLError) as e:
            if isinstance(e,urllib.error.HTTPError) or attempt:raise
    raise RuntimeError('Transfer failed')

def run(inventory,root,cache,report):
    source=json.loads(inventory.read_text());groups={}
    for f in source['files']:
        if f['path'].lower().endswith('.csv') and f.get('lfsOid'):
            groups.setdefault(f['lfsOid'],{'oid':f['lfsOid'],'size':f['declaredPayloadBytes'],'paths':[]})['paths'].append(f['path'])
    root=root.resolve();cache.mkdir(parents=True,exist_ok=True);report.parent.mkdir(parents=True,exist_ok=True)
    # Space for the object cache plus independent local copies; avoid hard-link alias mutations.
    required=sum(g['size']*(1+len(g['paths'])) for g in groups.values())+256*1024**2
    if shutil.disk_usage(root).free<required:raise RuntimeError(f'Insufficient free disk space; conservative requirement {required} bytes')
    results=[];downloaded=0
    values=list(groups.values())
    def save(status,error=None):
        report.write_text(json.dumps(dict(status=status,uniqueCsvObjects=len(groups),verifiedObjects=len(results),verifiedBytes=downloaded,
            csvPaths=sum(len(o['paths']) for o in results),error=error,objects=results,trainingRun=False,pairingsApproved=False),indent=2)+'\n')
    save('running')
    try:
        for start in range(0,len(values),20):
            group=values[start:start+20]
            pending=[{'oid':g['oid'],'size':g['size']} for g in group if not (cache/g['oid']).exists()]
            responses=batch(pending) if pending else {}
            for g in group:
                if g['oid'] not in responses:responses[g['oid']]={'oid':g['oid'],'size':g['size']}
                if responses[g['oid']]['size']!=g['size']:raise RuntimeError('Server/pointer size mismatch')
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                tasks={pool.submit(fetch,responses[g['oid']],cache):g for g in group}
                for future in concurrent.futures.as_completed(tasks):
                    g=tasks[future];payload=future.result()
                    for relative in g['paths']:
                        target=(root/relative).resolve()
                        if not target.is_relative_to(root):raise RuntimeError('Unsafe destination path')
                        with target.open('rb') as f:prefix=f.read(128)
                        if not prefix.startswith(PREFIX):
                            if sha(target)==g['oid']:continue
                            raise RuntimeError('Modified local file; refusing overwrite: '+relative)
                        # Check pointer identity again before replacing its contents atomically.
                        if ('oid sha256:'+g['oid']) not in target.read_text():raise RuntimeError('Pointer changed')
                        staged=target.with_name(target.name+'.navdr-download')
                        shutil.copyfile(payload,staged);os.replace(staged,target)
                    downloaded+=g['size'];results.append({'oid':g['oid'],'bytes':g['size'],'sha256Verified':True,'paths':g['paths']})
                    save('running');print(json.dumps({'verified':len(results),'total':len(groups),'verifiedMiB':round(downloaded/1024**2,1)}),flush=True)
        save('complete')
    except Exception as e:
        # Avoid logging signed download URLs/headers in exception text.
        error={'type':type(e).__name__,'httpStatus':getattr(e,'code',None)}
        if isinstance(e,RuntimeError):error['message']=str(e)
        save('failed',error);print(json.dumps(error),flush=True);raise SystemExit(1)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('inventory',type=Path);p.add_argument('root',type=Path)
    p.add_argument('--cache',type=Path,default=Path('.local-tools/io-vnbd-lfs'));p.add_argument('--report',type=Path,required=True);a=p.parse_args()
    run(a.inventory,a.root,a.cache,a.report)
