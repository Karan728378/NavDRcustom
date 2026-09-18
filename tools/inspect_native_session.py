#!/usr/bin/env python3
"""Inspect navdr.events.v1 without claiming missing callbacks prove hardware loss."""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
from import_native_session import validate_frame


def number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


class Stats:
    def __init__(self): self.n = 0; self.total = 0.; self.lo = None; self.hi = None
    def add(self, x):
        self.n += 1; self.total += x
        self.lo = x if self.lo is None else min(x, self.lo)
        self.hi = x if self.hi is None else max(x, self.hi)
    def result(self):
        return dict(count=self.n, min=self.lo, max=self.hi, mean=self.total/self.n if self.n else None)


def inspect(path):
    counts = collections.Counter(); errors=[]; header=None; footer=None; digest=hashlib.sha256()
    last={}; intervals=collections.defaultdict(Stats); delays=collections.defaultdict(Stats)
    gaps=collections.Counter(); gnss_age=Stats(); frame_intervals=Stats(); frame_gaps=0
    last_frame=None; events=0; dropped=0; last_drop_ns=None; frame_count=0
    raw_accels=0; stale_accels=0; pending=collections.deque(); recent=set(); unmatched=0
    def error(line, message):
        if len(errors)<100: errors.append(dict(line=line,message=message))
    with path.open('rb') as f:
        for line, raw in enumerate(f,1):
            digest.update(raw)
            try:
                row=json.loads(raw,parse_constant=lambda v: (_ for _ in ()).throw(ValueError(v)))
                if not isinstance(row,dict): raise ValueError('event must be object')
                kind=row.get('type')
                if not isinstance(kind,str): raise ValueError('missing event type')
                counts[kind]+=1
                if header is None:
                    if kind!='session' or row.get('schema')!='navdr.events.v1': raise ValueError('expected session header')
                    header=row;continue
                if footer is not None: raise ValueError('data after end')
                if kind=='session': raise ValueError('duplicate session header')
                if kind=='end':
                    if type(row.get('complete')) is not bool or type(row.get('eventCount')) is not int: raise ValueError('invalid footer')
                    footer=row;continue
                events+=1
                if kind=='sensor':
                    k=row.get('sensorType');t=row.get('timestampNs');arrival=row.get('arrivalTimestampNs');v=row.get('values')
                    if type(k) is not int or not number(t) or t<0 or not number(arrival) or arrival<t: raise ValueError('invalid sensor timestamps/type')
                    if not isinstance(v,list) or len(v)<3 or not all(map(number,v)): raise ValueError('invalid sensor vector')
                    if k in last:
                        delta=(t-last[k])/1e6
                        if delta<=0: raise ValueError('sensor timestamps not strictly increasing')
                        intervals[k].add(delta)
                        expected=header.get('requestedImuPeriodUs',10000)/1000 if k in (1,4) else 50
                        if delta>1.5*expected: gaps[k]+=1
                    last[k]=t;delays[k].add((arrival-t)/1e6)
                    if k==1:
                        raw_accels+=1
                        if arrival-t>250_000_000: stale_accels+=1
                        pending.append(t);recent.add(t)
                        # Matching cache is bounded; expected app synchronization queue is only 32.
                        if len(pending)>4096: recent.discard(pending.popleft())
                elif kind=='frame':
                    t=row.get('timestampMs');g=row.get('gyroTimestampNs')
                    if not number(t) or t<0 or not number(g) or not 0<=t*1e6-g<=30_000_000: raise ValueError('invalid frame/gyro timestamp')
                    if type(row.get('gnssAvailable')) is not bool: raise ValueError('missing frame availability')
                    if not all(isinstance(row.get(k),list) and len(row[k])==3 and all(map(number,row[k])) for k in ('accel','gyro')): raise ValueError('invalid frame vectors')
                    validate_frame(row, last_frame)
                    if last_frame is not None:
                        if t<=last_frame: raise ValueError('frame timestamps not strictly increasing')
                        frame_intervals.add(t-last_frame)
                        if t-last_frame>100: frame_gaps+=1
                    last_frame=t;frame_count+=1
                    if round(t*1e6) not in recent: unmatched+=1
                    fix=row.get('gnss')
                    if fix is not None:
                        if not row['gnssAvailable'] or row.get('gnssMasked'): raise ValueError('masked fix in frame')
                        if not isinstance(fix,dict) or not number(fix.get('timestampMs')) or fix['timestampMs']>t: raise ValueError('invalid frame GNSS time')
                        gnss_age.add(t-fix['timestampMs'])
                elif kind=='gnss':
                    fix=row.get('fix',{});a=row.get('arrivalTimestampNs');t=fix.get('timestampMs')
                    if not number(a) or not number(t) or a<t*1e6: raise ValueError('invalid GNSS delivery timestamp')
                    if not all(number(fix.get(k)) for k in ('lat','lon','accuracy')) or abs(fix['lat'])>90 or abs(fix['lon'])>180 or fix['accuracy']<=0: raise ValueError('invalid raw GNSS fields')
                    delays['gnss'].add(a/1e6-t)
                elif kind=='navigation':
                    d=row.get('droppedPairs');t=row.get('timestampNs')
                    if type(d) is not int or d<dropped or not number(t): raise ValueError('invalid synchronizer counter')
                    dropped=d;last_drop_ns=t
            except (ValueError,TypeError,KeyError,UnicodeDecodeError) as e: error(line,str(e))
    if header is None: error(0,'missing session header')
    if footer and footer['eventCount']!=events: error(0,'footer event count mismatch')
    complete=bool(footer and footer['complete'] and path.suffix!='.partial' and not errors)
    return dict(schema='navdr.inspection.v1',source=str(path),sha256=digest.hexdigest(),
        status='malformed' if errors else 'complete' if complete else 'incomplete',
        completion=dict(footerPresent=footer is not None,declaredComplete=footer.get('complete') if footer else None,eventCountMatches=footer['eventCount']==events if footer else None),
        eventCounts=dict(counts),countedBodyEvents=events,
        sensorIntervalsMs={str(k):v.result() for k,v in intervals.items()},
        deliveryDelayMs={str(k):v.result() for k,v in delays.items()},rawSensorGapCounts={str(k):v for k,v in gaps.items()},
        frameIntervalsMs=frame_intervals.result(),frameGapsOver100Ms=frame_gaps,gnssAgeAtFrameMs=gnss_age.result(),
        pairing=dict(rawAccelerometerEvents=raw_accels,pairedFrames=frame_count,
            rawAccelerometersWithoutFrame=raw_accels-frame_count,staleAccelerometerDeliveries=stale_accels,
            synchronizerRejectedCounter=dropped,counterTimestampNs=last_drop_ns,
            counterIsFinal=False,framesWithoutMatchingRecentRawAccel=unmatched,
            note='Counter is the last published snapshot, not a final loss count. Unpaired samples may be queued at stop or discarded before synchronization; never equate them with hardware loss.'),
        hardwareLoss=dict(confirmedCount=None,status='not_identifiable_from_callback_log',
            note='Raw timestamp gaps are observed upstream of frame pairing; they do not establish hardware loss versus OS scheduling, batching, or requested/actual rate differences. Synchronizer rejection is a separate recorded counter.'),errors=errors)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);a=p.parse_args()
    try:
        result=inspect(a.source); print(json.dumps(result,indent=2,allow_nan=False));raise SystemExit(1 if result['status']=='malformed' else 0)
    except OSError as e: p.exit(2,str(e)+'\n')
