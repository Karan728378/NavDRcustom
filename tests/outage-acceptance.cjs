const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const ctx={console,performance:{now:()=>0},setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['ai-motion-estimator','gnss-quality','navigation-core','accuracy-benchmark'])vm.runInContext(fs.readFileSync(`js/${f}.js`,'utf8'),ctx);
const N=ctx.NavDR,C=N.Core,dir='docs/evidence/2026-09-16';
const scorer=new C.OutageScorer(),frames=[];let t=0,n=0;
function feed(available,north,error,missing=false){const ref=C.geo([north,0],{lat:0,lon:0}); const f={timestampMs:t,gnssAvailable:available,...(!missing?{reference:ref}:{})};const pos=C.geo([error,0],ref);frames.push({frame:f,position:pos,raw:pos});scorer.step(f,pos,pos);t+=1000;}
for(let j=0;j<2;j++){feed(true,n,0);for(let i=1;i<=10;i++)feed(false,n+i*10,15);n+=100;feed(true,n,0);}
const out=scorer.results();assert.equal(out.length,2);for(const r of out){assert.ok(Math.abs(r.outageDistance-100)<1e-8);assert.ok(Math.abs(r.driftPercent-15)<1e-8);}
fs.writeFileSync(`${dir}/fixtures/two-outages.json`,JSON.stringify(frames,null,2)+'\n');
fs.writeFileSync(`${dir}/two-outages.output.json`,JSON.stringify(out,null,2)+'\n');
console.log('EXACT TWO-OUTAGE ACCEPTANCE:');console.log(JSON.stringify(out.map(x=>({id:x.id,distanceM:x.outageDistance,peakErrorM:x.maxOutput,driftPercent:x.driftPercent})),null,2));
const incomplete=new C.OutageScorer();for(const x of frames.slice(0,12)){const f={...x.frame};if(f.timestampMs===5000)delete f.reference;incomplete.step(f,x.position,x.raw);}
N.Workbench={source:'replay',lastOutput:{elapsed:12,outages:incomplete.results(),metrics:{...incomplete.results()[0],rawError:null,outputError:null,improvementPercent:null}}};
N.AccuracyBenchmark.history=[{correctedDriftPct:0,status:'STALE SENTINEL'}];
const result=N.AccuracyBenchmark.currentResult();assert.equal(result.outages[0].driftPercent,null);assert.equal(result.outages[0].status,'INCOMPLETE REFERENCE');
const csv=N.AccuracyBenchmark.currentCSV();assert.ok(!csv.includes('STALE'));assert.ok(csv.includes(',null,"INCOMPLETE REFERENCE"'));
fs.writeFileSync(`${dir}/incomplete-export.json`,JSON.stringify(result,null,2)+'\n');fs.writeFileSync(`${dir}/incomplete-export.csv`,csv);
console.log('INCOMPLETE REFERENCE EXPORT:');console.log(csv);
N.Workbench={source:'device',lastOutput:{metrics:null,outages:[]}};assert.equal(N.AccuracyBenchmark.currentResult().metrics,null);assert.equal(N.AccuracyBenchmark.getState().correctedDriftPercent,null);assert.equal(N.AccuracyBenchmark.getState().avgRawError,null);
console.log('PASS: current device result clears prior replay metrics; no stale history export.');

const unavailable=new C.OutageScorer();for(const x of frames.slice(0,12))unavailable.step(x.frame,null,null);
assert.equal(unavailable.results()[0].status,'INCOMPLETE OUTPUT');assert.equal(unavailable.results()[0].driftPercent,null);
const unaligned=new C.NavigationSession({mount:null});for(const x of frames.slice(0,12))unaligned.step({...x.frame,accel:[0,0,9.80665],gyro:[0,0,0]});
assert.equal(unaligned.output.outages[0].status,'INCOMPLETE OUTPUT');
console.log('PASS: unavailable/mount-uncalibrated output remains counted and unscored.');
