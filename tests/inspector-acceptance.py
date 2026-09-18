import json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];d=root/'docs/evidence/2026-09-16';f=d/'fixtures'
header=dict(type='session',schema='navdr.events.v1',sessionId='synthetic-fixture',reference='none',requestedImuPeriodUs=10000,mount={'up':[0,0,1],'forward':[0,1,0]})
def make(times,omit=()):
 rows=[header]
 for ms in times:
  for typ,values in [(1,[0,0,9.80665]),(4,[0,0,0])]:
   rows.append(dict(type='sensor',sensorType=typ,timestampNs=ms*1000000,arrivalTimestampNs=(ms+1)*1000000,values=values))
  if ms not in omit:
   row=dict(type='frame',timestampMs=ms,gyroTimestampNs=ms*1000000,accel=[0,0,9.80665],gyro=[0,0,0],gnssAvailable=True)
   if ms==times[0]:row['gnss']=dict(timestampMs=ms-1,lat=28,lon=77,accuracy=2,speedMps=10,heading=0,isMock=False)
   rows.append(row)
  rows.append(dict(type='navigation',timestampNs=ms*1000000,droppedPairs=sum(x<=ms for x in omit)))
 rows.append(dict(type='end',complete=True,eventCount=len(rows)-1));return rows
valid=make([10,20,30]);gapped=make([10,20,150],omit=[20])
# Deliberately malformed frame vector, with otherwise correct envelope/counts.
malformed=make([10,20]);malformed[3]['accel']=[0,'broken',0]
for name,rows in [('valid',valid),('gapped',gapped),('incomplete',valid[:-1]),('malformed',malformed)]:
 path=f/(name+('.partial' if name=='incomplete' else '.jsonl'));path.write_text(''.join(json.dumps(r)+'\n' for r in rows))
 result=subprocess.run([sys.executable,str(root/'tools/inspect_native_session.py'),str(path.relative_to(root))],cwd=root,text=True,capture_output=True)
 (d/(name+'.inspection.json')).write_text(result.stdout);o=json.loads(result.stdout)
 assert o['status']==('complete' if name in ('valid','gapped') else name)
 assert result.returncode==(1 if name=='malformed' else 0)
 if name=='gapped':
  assert o['frameGapsOver100Ms']==1 and o['pairing']['synchronizerRejectedCounter']==1
  assert o['rawSensorGapCounts']=={'1':1,'4':1} and o['hardwareLoss']['confirmedCount'] is None
 if name=='valid':assert o['gnssAgeAtFrameMs']['mean']==1 and o['pairing']['rawAccelerometersWithoutFrame']==0
 print(json.dumps(dict(fixture=path.name,status=o['status'],frameGaps=o['frameGapsOver100Ms'],rawGaps=o['rawSensorGapCounts'],syncRejected=o['pairing']['synchronizerRejectedCounter'],hardwareLoss=o['hardwareLoss']['confirmedCount'],errors=o['errors'])))
print('PASS: valid, gapped, incomplete and malformed fixtures inspected via CLI.')
