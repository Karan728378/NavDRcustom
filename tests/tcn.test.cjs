const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const ctx={performance,console};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['config','ai-motion-estimator','road-hmm','gnss-quality','navigation-core'])vm.runInContext(fs.readFileSync(`js/${f}.js`,'utf8'),ctx);
const N=ctx.NavDR;
function model(){const m=Object.create(N.AIMotionEstimator);m.reset();return m;}
function sample(i){return {timestampMs:i*10,accel:[Math.sin(i*.1),0,0],gyro:[0,0,.01]};}
test('parameter count includes actual participating weights and reset is deterministic',()=>{
 const a=new N.StreamingTCN(),b=new N.StreamingTCN();assert.equal(a.weights.length,49665);
 const x=[1,2,3,.1,.2,.3];const first=a.step(x);assert.equal(first,b.step(x));
 a.step(x);a.reset();assert.equal(a.step(x),first);
 assert.notEqual(new N.StreamingTCN().step([0,0,0,0,0,0]),first);
});
test('streaming outputs are causal and isolated between sessions',()=>{
 const a=model(),b=model();a.acceptGNSS({speedMps:10});b.acceptGNSS({speedMps:10});
 for(let i=0;i<260;i++)assert.equal(a.ingest(sample(i)).estimatedSpeedMps,b.ingest(sample(i)).estimatedSpeedMps);
 const past=a.estimatedSpeedMps;b.ingest({...sample(260),accel:[100,0,0]});assert.equal(a.estimatedSpeedMps,past);
});
test('100 Hz samples produce 20 Hz inference, bounded residual and explicit untrained status',()=>{
 const m=model();m.acceptGNSS({speedMps:10,timestampMs:0});
 for(let i=0;i<1000;i++){const s=m.ingest(sample(i));assert.ok(s.estimatedSpeedMps>=8&&s.estimatedSpeedMps<=12);}
 assert.equal(m.measuredRateHz,100);assert.equal(m.inferenceCount,200);
 assert.equal(m.modelStatus,'SIMULATED_UNTRAINED');assert.equal(m.getState().speedConfidenceLevel,'UNCALIBRATED');
});
test('missing data, unknown speed, low actual sample rate and malformed samples are explicit',()=>{
 const m=model();assert.equal(m.ingest(sample(0)).modelStatus,'NO_VELOCITY_ANCHOR');
 m.acceptGNSS({speedMps:10,timestampMs:0});m.ingest(sample(100));assert.equal(m.modelStatus,'MISSING_DATA');
 assert.throws(()=>m.ingest(sample(100)),/increase/);assert.throws(()=>m.ingest({...sample(101),accel:[NaN,0,0]}),/Invalid/);
 m.reset();m.acceptGNSS({speedMps:10,timestampMs:0});for(let i=0;i<240;i++)m.ingest({...sample(i),timestampMs:i*50});
 assert.equal(m.measuredRateHz,20);assert.equal(m.modelStatus,'LOW_SAMPLE_RATE');
});
test('reference never enters model; rejected GNSS cannot update velocity anchor',()=>{
 const a=new N.Core.NavigationSession({hmm:false,tcn:true}),b=new N.Core.NavigationSession({hmm:false,tcn:true});
 for(let i=0;i<300;i++){
 const f={timestampMs:i*10,accel:[0,0,9.80665],gyro:[0,0,0],gnssAvailable:i===0||i===280,gnss:i===0?{lat:28,lon:77,speedMps:10,heading:0,accuracy:2,timestampMs:0}:i===280?{lat:29,lon:78,speedMps:55,heading:0,accuracy:2,timestampMs:2800}:null};
 a.step(f);b.step({...f,reference:{lat:28+i*.001,lon:77}});
 assert.equal(a.model.estimatedSpeedMps,b.model.estimatedSpeedMps);
 }
 assert.equal(a.model.anchor,10);assert.ok(a.filter.rejected>0);
 assert.equal(a.model.modelStatus,'SIMULATED_UNTRAINED');
});
