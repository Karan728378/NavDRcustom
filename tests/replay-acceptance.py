"""Actual JVM CLI repeatability on an explicitly synthetic native-format recording."""
import json,subprocess,sys,tempfile,csv,os,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'docs/evidence/2026-09-16'
header=json.loads((E/'fixtures/valid.jsonl').read_text().splitlines()[0]);header['sessionId']='synthetic-six-second-replay'
rows=[header]
for i in range(601):
 ms=10+i*10
 for typ,v in [(1,[0,0,9.80665]),(4,[0,0,0])]:rows.append(dict(type='sensor',sensorType=typ,timestampNs=ms*1000000,arrivalTimestampNs=(ms+1)*1000000,values=v))
 f=dict(type='frame',timestampMs=ms,gyroTimestampNs=ms*1000000,accel=[0,0,9.80665],gyro=[0,0,0],gnssAvailable=i==0 or i>=500,gnssMasked=0<i<500)
 if i in (0,500):f['gnss']=dict(timestampMs=ms,lat=28+(i*.1/6371000)*180/3.141592653589793,lon=77,accuracy=2,speedMps=10,heading=0,isMock=False)
 rows.append(f)
rows.append(dict(type='end',complete=True,eventCount=len(rows)-1));source=E/'fixtures/replay.jsonl';source.write_text(''.join(json.dumps(r)+'\n' for r in rows))
with tempfile.TemporaryDirectory(prefix='navdr-cli-acceptance-') as tmp:
 tmp=Path(tmp);env=os.environ.copy()
 for index in (1,2):
  target=tmp/f'run-{index}.csv'
  r=subprocess.run([sys.executable,str(ROOT/'tools/replay_native.py'),str(source),str(target)],env=env,capture_output=True,text=True,check=True)
  (E/f'replay-run-{index}.log').write_text(r.stdout+r.stderr);shutil.copy2(target,E/f'replay-run-{index}.csv')
 a=(tmp/'run-1.csv').read_bytes();b=(tmp/'run-2.csv').read_bytes();assert a==b
 # Reference fields in native sensor frames must be rejected before invoking the engine.
 for row in rows:
  if row['type']=='frame':row['reference']={'lat':-40,'lon':-70}
 mutated=tmp/'mutated.jsonl';mutated.write_text(''.join(json.dumps(r)+'\n' for r in rows))
 r=subprocess.run([sys.executable,str(ROOT/'tools/replay_native.py'),str(mutated),str(tmp/'reference-mutated.csv')],capture_output=True,text=True,env=env)
 assert r.returncode!=0 and 'must not invent independent reference' in r.stderr
 assert not (tmp/'reference-mutated.csv').exists()
 data=list(csv.DictReader(a.decode().splitlines()));assert len(data)==601 and any(r['mode']=='DEAD_RECKONING' for r in data)
 report=dict(provenance='synthetic native-format recording; not a physical phone run',rows=len(data),byteIdentical=True,numericTolerance=0,maximumAbsoluteDifference=0,injectedReferenceRejectedBeforeEstimator=True,observedModes=sorted({r['mode'] for r in data}))
 (E/'replay-comparison.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
 print('RUN 1 first/last:');print(a.decode().splitlines()[1]);print(a.decode().splitlines()[-1])
 print('RUN 2 first/last:');print(b.decode().splitlines()[1]);print(b.decode().splitlines()[-1])
