"""R10: random weights, exact existing TCN topology; conversion/CPU operator evidence only.
Does not choose a production runtime or claim Android device compatibility/performance.
"""
import argparse,json,os,subprocess,sys,traceback
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def run(runtime,out):
    import numpy as np
    import torch
    from model import NavDRTCN
    torch.set_num_threads(1);torch.manual_seed(26168)
    model=NavDRTCN().eval();x=torch.randn(1,6,231)*.1
    with torch.no_grad():expected=model(x).numpy()
    count=sum(p.numel() for p in model.parameters());assert count==49665
    # Execute the original JS StreamingTCN with the same fresh weights to validate adapter topology.
    payload=dict(weights=model.js_weights(),input=x[0].T.tolist())
    js="""const fs=require('fs'),vm=require('vm');let d=JSON.parse(fs.readFileSync(0,'utf8'));let c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync('js/ai-motion-estimator.js','utf8'),c);let n=new c.window.NavDR.StreamingTCN();n.weights=Float32Array.from(d.weights);let y;for(const row of d.input)y=n.step(row);console.log(JSON.stringify(y));"""
    r=subprocess.run(['node','-e',js],cwd=ROOT,input=json.dumps(payload),text=True,capture_output=True,check=True)
    js_difference=abs(float(r.stdout)-float(expected[0,0]));assert js_difference<1e-5,(js_difference,expected,r.stdout)
    base=dict(runtime=runtime,weights='fresh random, untrained',parameters=count,inputShape=list(x.shape),outputShape=list(expected.shape),
        jsParityMaxAbsDifference=js_difference,numericTolerance=1e-5,onAndroidDevice='UNTESTED',runtimeDecision='reserved for user/team')
    if runtime=='onnx':
        import onnx,onnxruntime as ort
        path=out/'tcn-random.onnx';torch.onnx.export(model,x,str(path),input_names=['imu'],output_names=['residual'],opset_version=17,dynamo=False)
        graph=onnx.load(str(path));onnx.checker.check_model(graph)
        session=ort.InferenceSession(str(path),providers=['CPUExecutionProvider']);actual=session.run(None,{'imu':x.numpy()})[0]
        base.update(operators=sorted({n.op_type for n in graph.graph.node}),runtimeVersion=ort.__version__,exportVersion=onnx.__version__)
    else:
        import litert_torch
        from ai_edge_litert.interpreter import Interpreter
        converted=litert_torch.convert(model,(x,));path=out/'tcn-random.tflite';converted.export(str(path))
        interp=Interpreter(model_path=str(path),num_threads=1);interp.allocate_tensors()
        inp=interp.get_input_details()[0];interp.set_tensor(inp['index'],x.numpy());interp.invoke()
        actual=interp.get_tensor(interp.get_output_details()[0]['index'])
        base.update(operators=sorted({o['op_name'] for o in interp._get_ops_details()}),runtimeVersion=__import__('importlib.metadata',fromlist=['version']).version('ai-edge-litert'))
    difference=float(np.max(np.abs(actual-expected)));assert np.allclose(actual,expected,atol=1e-5,rtol=0),difference
    base.update(status='converted_and_desktop_cpu_executed',maxAbsDifference=difference,artifact=str(path),torchVersion=str(torch.__version__))
    return base

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runtime',choices=['onnx','litert','both'],default='both');p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    if a.runtime!='both':
        try:result=run(a.runtime,a.output);status=0
        except Exception as e:traceback.print_exc();result=dict(runtime=a.runtime,status='failed',error=str(e),onAndroidDevice='UNTESTED');status=1
        (a.output/(a.runtime+'.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));raise SystemExit(status)
    summary=[]
    for runtime in ['onnx','litert']:
        env={**os.environ,'CUDA_VISIBLE_DEVICES':'','OMP_NUM_THREADS':'1','TF_NUM_INTRAOP_THREADS':'1','TF_NUM_INTEROP_THREADS':'1'}
        with (a.output/(runtime+'.log')).open('w') as log:
            try:r=subprocess.run([sys.executable,__file__,'--runtime',runtime,'--output',str(a.output)],stdout=log,stderr=subprocess.STDOUT,env=env,timeout=180)
            except subprocess.TimeoutExpired:summary.append(dict(runtime=runtime,status='timeout'));continue
        path=a.output/(runtime+'.json')
        summary.append(json.loads(path.read_text()) if path.exists() else dict(runtime=runtime,status='process_failed',exitCode=r.returncode))
    (a.output/'comparison.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
    raise SystemExit(0 if all(r['status']=='converted_and_desktop_cpu_executed' for r in summary) else 1)
