#!/usr/bin/env python3
"""Validate a native journal, strip to estimator-only TSV, invoke actual Kotlin CLI."""
import argparse,json,os,subprocess,tempfile
from pathlib import Path
from inspect_native_session import inspect

ROOT=Path(__file__).resolve().parents[1]

def replay(source,output,runner,allow_incomplete=False):
    report=inspect(source)
    if report['status']=='malformed' or (report['status']!='complete' and not allow_incomplete):
        raise ValueError('Journal not usable: '+json.dumps(report))
    if output.exists(): raise ValueError('Output exists')
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='navdr-replay-') as tmp:
        wire=Path(tmp)/'inputs.tsv'
        with source.open() as src,wire.open('w') as out:
            h=json.loads(next(src));m=h['mount']
            out.write('\t'.join(map(str,['navdr.estimator.v1',*m['up'],*m['forward']]))+'\n')
            for line in src:
                f=json.loads(line)
                if f['type']!='frame':continue
                fix=f.get('gnss');values=[round(f['timestampMs']*1e6),f['gyroTimestampNs'],*f['accel'],*f['gyro'],f['gnssAvailable'],bool(fix)]
                values += [round(fix['timestampMs']*1e6),fix['lat'],fix['lon'],fix['accuracy'],fix.get('speedMps'),fix.get('heading'),fix.get('isMock',False)] if fix else [None]*7
                # Explicit allowlist: no original JSON or reference field reaches the JVM.
                out.write('\t'.join('null' if v is None else str(v).lower() if type(v) is bool else str(v) for v in values)+'\n')
        subprocess.run([str(runner),str(wire),str(output.resolve())],check=True)
    print(json.dumps({'output':str(output),'sourceSha256':report['sha256'],'engine':'org.navdr.core.NavigationEngine','referenceSentToEstimator':False}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path)
    p.add_argument('--runner',type=Path,default=ROOT/'native/android/navigation/build/install/navigation/bin/navigation')
    p.add_argument('--allow-incomplete',action='store_true');a=p.parse_args()
    try: replay(a.source,a.output,a.runner,a.allow_incomplete)
    except (ValueError,OSError,subprocess.CalledProcessError) as e:p.exit(1,str(e)+'\n')
