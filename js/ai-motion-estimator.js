/* NavDR streaming causal TCN. Deterministic UNTRAINED demo weights.
 * Bounded GNSS-anchor constraints are separate from network inference.
 * No reference labels, route coordinates or future samples enter prediction.
 */
(function(N){
  'use strict';
  const WIDTH=32, KERNEL=6, DILATIONS=[1,1,2,2,4,4,16,16];
  const COUNT=6*WIDTH+WIDTH+DILATIONS.length*(KERNEL*WIDTH*WIDTH+WIDTH)+WIDTH+1;
  const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
  let weights;
  function parameters(){
    if(weights)return weights;
    let seed=26168;
    weights=new Float32Array(COUNT);
    for(let i=0;i<COUNT;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      weights[i]=(seed/4294967296-.5)*.08;
    }
    return weights;
  }
  class StreamingTCN{
    constructor(){this.weights=parameters();this.reset();}
    reset(){this.layers=DILATIONS.map(d=>({d,size:5*d+1,index:0,buffer:new Float32Array((5*d+1)*WIDTH)}));this.samples=0;}
    step(input){
      if(input.length!==6||!input.every(Number.isFinite))throw Error('TCN requires six finite IMU channels');
      const w=this.weights;let offset=0,x=new Float32Array(WIDTH);
      for(let o=0;o<WIDTH;o++){let sum=0;for(let i=0;i<6;i++)sum+=input[i]*w[offset++];x[o]=Math.tanh(sum);}
      for(let o=0;o<WIDTH;o++)x[o]=Math.tanh(x[o]+w[offset++]);
      let residual;
      for(let l=0;l<this.layers.length;l++){
        if(l%2===0)residual=x;
        const s=this.layers[l];s.buffer.set(x,s.index*WIDTH);
        const y=new Float32Array(WIDTH);
        for(let o=0;o<WIDTH;o++){
          let sum=0;
          for(let k=0;k<KERNEL;k++){
            const base=((s.index-k*s.d+s.size)%s.size)*WIDTH;
            for(let i=0;i<WIDTH;i++)sum+=s.buffer[base+i]*w[offset++];
          }
          y[o]=sum;
        }
        for(let o=0;o<WIDTH;o++)y[o]=Math.tanh(y[o]+w[offset++]+(l%2?residual[o]:0));
        s.index=(s.index+1)%s.size;x=y;
      }
      let output=0;for(let i=0;i<WIDTH;i++)output+=x[i]*w[offset++];
      this.samples++;return Math.tanh(output+w[offset]);
    }
  }
  N.StreamingTCN=StreamingTCN;
  N.AIMotionEstimator={
    enabled:true,_running:true,modelName:'Simulated TCN — untrained',
    reset(){
      this.network=new StreamingTCN();this.sensorWindow=[];this.datasetBuffer=[];
      this.lastTimestamp=null;this.firstTimestamp=null;this.lastInference=null;
      this.anchor=null;this.estimatedSpeedMps=0;this._prevEstimatedSpeed=0;
      this.modelStatus='WARMING_UP';this.inferenceTimeMs=0;this.sampleCount=0;
      this.inferenceCount=0;this.measuredRateHz=0;this.speedConfidence=0;
      this.motionState='UNKNOWN';this.rawNetworkOutput=0;this.anchorTimestamp=null;
    },
    initialize(){this.reset();},start(){this._running=true;},stop(){this._running=false;},
    setEnabled(value){this.enabled=!!value;},
    acceptGNSS(g){
      if(g&&Number.isFinite(g.speedMps)&&g.speedMps>=0&&g.speedMps<=60){
        this.anchor=g.speedMps;this.anchorTimestamp=g.timestampMs??this.lastTimestamp;
        this.estimatedSpeedMps=this.anchor;this._prevEstimatedSpeed=this.anchor;
      }
    },
    ingest(sample){
      if(!this.network)this.reset();
      if(!this.enabled||!this._running){this.modelStatus='DISABLED';return this.getState();}
      const {timestampMs,accel,gyro}=sample;
      if(!Number.isFinite(timestampMs)||!Array.isArray(accel)||!Array.isArray(gyro)||accel.length!==3||gyro.length!==3||![...accel,...gyro].every(Number.isFinite))throw Error('Invalid TCN IMU sample');
      if(this.lastTimestamp!==null&&timestampMs<=this.lastTimestamp)throw Error('TCN timestamps must increase');
      if(this.lastTimestamp!==null&&timestampMs-this.lastTimestamp>100){
        this.network.reset();this.sensorWindow=[];this.firstTimestamp=null;this.lastInference=null;
        this.modelStatus='MISSING_DATA';
      }
      this.lastTimestamp=timestampMs;this.firstTimestamp??=timestampMs;
      this.sensorWindow.push(timestampMs);
      while(this.sensorWindow.length>1&&timestampMs-this.sensorWindow[0]>2500)this.sensorWindow.shift();
      this.measuredRateHz=this.sensorWindow.length>1?(this.sensorWindow.length-1)*1000/(timestampMs-this.sensorWindow[0]):0;
      const begin=performance.now();
      // Scaling constants are declared demo engineering choices, not learned normalization.
      this.rawNetworkOutput=this.network.step([...accel.map(v=>clip(v/9.80665,-4,4)),...gyro.map(v=>clip(v/3,-4,4))]);
      this.sampleCount++;
      const ready=this.network.samples>=231&&timestampMs-this.firstTimestamp>=2300;
      this.modelStatus=ready?(this.measuredRateHz>=90&&this.measuredRateHz<=110?'SIMULATED_UNTRAINED':'LOW_SAMPLE_RATE'):(this.modelStatus==='MISSING_DATA'?'MISSING_DATA':'WARMING_UP');
      if(this.anchor===null)this.modelStatus='NO_VELOCITY_ANCHOR';
      if(this.lastInference===null||timestampMs-this.lastInference>=50-1e-6){
        this.lastInference=timestampMs;this.inferenceCount++;
        // Non-accumulating residual: no recursively integrated random-network output.
        // This holds a recent GNSS anchor +/- 2 m/s; it cannot track arbitrary acceleration.
        const predicted=this.anchor===null?0:clip(this.anchor+(ready?2*this.rawNetworkOutput:0),0,60);
        this.estimatedSpeedMps=predicted;this._prevEstimatedSpeed=predicted;
        this.motionState=this.anchor===null?'UNKNOWN':(predicted<.3?'STATIONARY':'MOVING');
      }
      this.inferenceTimeMs=performance.now()-begin;
      return this.getState();
    },
    // Compatibility with legacy instrument consumers. Active sessions call ingest directly.
    update(data,dr,g,dt){
      const a=data?.vehicleFrameAcceleration, r=data?.gyroscope?.filtered;
      if(!a||!r)return this.getState();
      return this.ingest({timestampMs:this._sampleClock??((this.lastTimestamp??0)+(dt||.01)*1000),accel:[a.forward,a.lateral,a.vertical],gyro:[r.x||0,r.y||0,r.z||0]});
    },
    getModelInfo(){return {name:this.modelName,type:'Causal residual TCN',parameterCount:COUNT,inputChannels:6,targetRateHz:100,inferenceRateHz:20,receptiveFieldSamples:231,trainingStatus:'UNTRAINED — deterministic demo weights',constraint:'Last accepted GNSS speed plus bounded ±2 m/s residual; not learned drift suppression'};},
    getState(){return {enabled:this.enabled,modelName:this.modelName,modelStatus:this.modelStatus,estimatedSpeedMps:this.estimatedSpeedMps,estimatedSpeedKmh:this.estimatedSpeedMps*3.6,speedConfidence:0,speedConfidenceLevel:'UNCALIBRATED',motionState:this.motionState,inferenceTimeMs:this.inferenceTimeMs,measuredRateHz:this.measuredRateHz,sampleCount:this.sampleCount,inferenceCount:this.inferenceCount,parameterCount:COUNT,rawNetworkOutput:this.rawNetworkOutput,anchorAgeMs:this.anchorTimestamp===null?null:this.lastTimestamp-this.anchorTimestamp,referenceAvailable:false};},
    getFeatures(){return [];},
    exportDataset(){return this.datasetBuffer.slice();}
  };
})(window.NavDR=window.NavDR||{});
