#!/usr/bin/env python3
"""Offline evaluator. References are separate timestampNs/lat/lon CSV; never estimator input.
Exact timestamp matching only; no invented interpolation or official scoring thresholds.
"""
import argparse,csv,json,math
from pathlib import Path

def distance(a,b):
    return math.hypot(math.radians(a[0]-b[0])*6371000,math.radians(a[1]-b[1])*6371000*math.cos(math.radians(b[0])))

def point(row):
    if row.get('lat') in (None,'null','') or row.get('lon') in (None,'null',''):return None
    p=(float(row['lat']),float(row['lon']))
    if not all(map(math.isfinite,p)) or abs(p[0])>90 or abs(p[1])>180:raise ValueError('Invalid position')
    return p

def evaluate(outputs,reference=None):
    refs={}
    if reference:
        with reference.open() as f:
            for r in csv.DictReader(f):
                t=int(r['timestampNs'])
                if t in refs:raise ValueError('Duplicate reference time')
                refs[t]=point(r)
    intervals=[];active=None;previous=None;last_t=None;total=0;matched=0
    with outputs.open() as f:
        for r in csv.DictReader(f):
            t=int(r['timestampNs']);p=point(r);ref=refs.get(t)
            if last_t is not None and t<=last_t:raise ValueError('Non-increasing output times')
            if r['gnssAvailable'] not in ('true','false'):raise ValueError('Invalid availability')
            total+=1;matched+=ref is not None
            if r['gnssAvailable']=='false':
                if active is None:
                    active=dict(id=len(intervals)+1,distanceM=0.,peakErrorM=None,referenceComplete=True,outputComplete=True,samples=0,outputSamples=0)
                    intervals.append(active)
                active['samples']+=1;active['outputSamples']+=p is not None
                if ref is not None and previous is not None:active['distanceM']+=distance(ref,previous)
                else:active['referenceComplete']=False
                if p is None:active['outputComplete']=False
                if p is not None and ref is not None:active['peakErrorM']=max(active['peakErrorM'] or 0,distance(p,ref))
            else:active=None
            previous=ref;last_t=t
    for a in intervals:
        valid=a['referenceComplete'] and a['outputComplete'] and a['distanceM']>0 and a['peakErrorM'] is not None
        a['driftPercent']=100*a['peakErrorM']/a['distanceM'] if valid else None
        a['status']='scored_no_official_pass_rule' if valid else 'incomplete_or_zero_distance'
    return dict(schema='navdr.offline-evaluation.v1',samples=total,matchedReferenceSamples=matched,referenceProvided=bool(reference),outages=intervals,
                note='Exact timestamp matching. Caller must qualify reference uncertainty/rights; no authenticated PS pass rule assumed.')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('outputs',type=Path);p.add_argument('--reference',type=Path);a=p.parse_args()
    try:print(json.dumps(evaluate(a.outputs,a.reference),indent=2,allow_nan=False))
    except (ValueError,KeyError,OSError) as e:p.exit(1,str(e)+'\n')
