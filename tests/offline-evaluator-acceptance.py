import csv,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from evaluate_navigation import evaluate
E=Path('docs/evidence/2026-09-16');frames=json.loads((E/'fixtures/two-outages.json').read_text())
with (E/'fixtures/offline-outputs.csv').open('w') as f,(E/'fixtures/offline-reference.csv').open('w') as ref:
 w=csv.writer(f);v=csv.writer(ref);w.writerow(['timestampNs','gnssAvailable','lat','lon']);v.writerow(['timestampNs','lat','lon'])
 for x in frames:
  row=x['frame'];t=round(row['timestampMs']*1e6)
  w.writerow([t,str(row['gnssAvailable']).lower(),x['position']['lat'],x['position']['lon']]);v.writerow([t,row['reference']['lat'],row['reference']['lon']])
a=evaluate(E/'fixtures/offline-outputs.csv',E/'fixtures/offline-reference.csv')
assert len(a['outages'])==2
for r in a['outages']:assert abs(r['driftPercent']-15)<1e-8
b=evaluate(E/'fixtures/offline-outputs.csv');assert all(r['driftPercent'] is None for r in b['outages'])
(E/'offline-evaluator-acceptance.json').write_text(json.dumps({'withSyntheticReference':a,'withoutReference':b},indent=2)+'\n')
print('PASS: offline evaluator reports two independent 15% synthetic intervals; missing reference yields null for both.')
