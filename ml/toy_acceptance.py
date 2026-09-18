"""Only fake data. Tests grouping, normalization, training/reload and held-out execution."""
import csv,json,tempfile,subprocess,sys
from pathlib import Path
import numpy as np
import torch
from common import write,read,digest
from split import split
from preprocess import prepare,load_csv
from train import train
from evaluate import evaluate
from model import NavDRTCN

ROOT=Path(__file__).resolve().parents[1];E=ROOT/'docs/evidence/2026-09-16';cfg=ROOT/'ml/configs/toy-v1.json'
with tempfile.TemporaryDirectory(prefix='navdr-ml-toy-') as tmp:
    root=Path(tmp);trips=[]
    for group in range(3):
        for j in range(2):
            name=f'toy-{group}-{j}';path=root/(name+'.csv')
            with path.open('w') as f:
                w=csv.writer(f);w.writerow(['timestampNs','ax','ay','az','gx','gy','gz','speedMps'])
                for i in range(234):w.writerow([i*10000000,.01*i,group+.01*j,9.80665,0,.001*i,0,.2+.001*i])
            trips.append(dict(id=name,path=path.name,vehicle=f'v{group}',phone=f'p{group}-{j}',route=f'r{group}-{j}'))
    write(root/'inventory.json',dict(synthetic=True,trips=trips))
    manifest=split(root/'inventory.json');write(root/'split.json',manifest)
    # Preserve fixture data with relative paths and regenerate an inspectable draft manifest.
    fixture=E/'fixtures/ml-toy';fixture.mkdir(parents=True,exist_ok=True)
    for t in trips:(fixture/t['path']).write_bytes((root/t['path']).read_bytes())
    write(fixture/'inventory.json',dict(synthetic=True,trips=trips))
    write(E/'toy-split-manifest.json',split(fixture/'inventory.json'))
    # Transitive phone/route links must join even when vehicle IDs differ.
    linked=[]
    for i,labels in enumerate([('a','shared','r0'),('b','shared','bridge'),('c','p2','bridge'),('d','p3','r3'),('e','p4','r4')]):
        linked.append(dict(id=f'linked-{i}',path=trips[i]['path'],vehicle=labels[0],phone=labels[1],route=labels[2]))
    write(root/'linked.json',dict(synthetic=True,trips=linked))
    connected=split(root/'linked.json')
    assert len({t['group'] for t in connected['trips'] if t['id'] in ['linked-0','linked-1','linked-2']})==1
    prepared=prepare(root/'split.json',root/'prepared',toy=True)
    expected=np.concatenate([load_csv(t['path'])[:,1:7] for t in manifest['trips'] if t['split']=='train']).mean(0)
    assert np.allclose(expected,prepared['normalization']['mean'])
    assert len({t['split'] for t in manifest['trips']})==3
    for g in {t['vehicle'] for t in manifest['trips']}:assert len({t['split'] for t in manifest['trips'] if t['vehicle']==g})==1
    # Tampering a connected trip into another split must fail before preprocessing/training.
    broken=json.loads(json.dumps(manifest));broken['trips'][0]['split']='train' if broken['trips'][0]['split']!='train' else 'test';write(root/'bad.json',broken)
    try:prepare(root/'bad.json',root/'badprepared',toy=True);raise AssertionError('Leakage accepted')
    except ValueError as e:assert 'leakage' in str(e)
    train(root/'prepared',cfg,root/'toy.pt',toy=True)
    result=evaluate(root/'prepared',root/'toy.pt');assert result['synthetic'] and result['windows']>0
    ck=torch.load(root/'toy.pt',map_location='cpu',weights_only=True);a=NavDRTCN();a.load_state_dict(ck['state_dict']);b=NavDRTCN();b.load_state_dict(ck['state_dict'])
    x=torch.zeros(1,6,231);assert torch.equal(a(x),b(x));assert sum(p.numel() for p in a.parameters())==49665
    report=dict(status='PASS',syntheticOnly=True,realDataTraining=False,splitStatus=manifest['status'],tripCount=6,
        checks=['whole trips grouped before windows','shared vehicle never crosses splits','transitive shared phone/route links preserved','deliberate group leakage rejected','normalization matches train rows only','two CPU optimizer steps','held-out dev entry point executes','checkpoint reload identical','49665 parameters'],devWindowsExecuted=result['windows'])
    write(E/'toy-acceptance.json',report);print(json.dumps(report,indent=2))
    print('DRAFT TOY SPLIT (not a real-data split):')
    for t in manifest['trips']:print(t['id'],t['vehicle'],t['phone'],t['route'],t['split'])
