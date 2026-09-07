#!/usr/bin/env python3
"""Convert IO-VNBD smartphone CSV to NavDR frames, preserving provenance.

Columns verified against the official S-S1.csv header. Mount yaw and gyro axis
mapping are explicit because logger labels alone do not establish device axes.
No independent reference is inferred from the phone's GNSS measurements.
"""
import argparse, csv, hashlib, json, math
from pathlib import Path

def vector(text):
    values=[float(v) for v in text.split(',')]
    if len(values)!=3 or not all(math.isfinite(v) for v in values):
        raise argparse.ArgumentTypeError('Expected three finite comma-separated values')
    return values

def convert(path, forward, up, gyro_axes, outage=None, limit=None):
    raw=Path(path).read_bytes()
    lines=raw.decode('utf-8',errors='replace').splitlines()
    reader=csv.DictReader(lines,skipinitialspace=True)
    frames=[];last_fix=-math.inf;start=None;last_time=-math.inf
    def read(row,prefix):
        keys=[k for k in row if k and k.strip().startswith(prefix)]
        if len(keys)!=1: raise ValueError('Missing or ambiguous column: '+prefix)
        value=float(row[keys[0]])
        if not math.isfinite(value): raise ValueError('Non-finite column: '+prefix)
        return value
    for row in reader:
        if limit is not None and len(frames)>=limit:break
        timestamp=read(row,'TIME SINCE START')
        if start is None:start=timestamp
        if timestamp<=last_time:raise ValueError('Timestamps must strictly increase; split/reset trips before importing')
        if last_time!=-math.inf and timestamp-last_time>2000:raise ValueError('IMU gap exceeds 2 seconds; split the trip')
        last_time=timestamp;elapsed=(timestamp-start)/1000
        accel=[read(row,'ACCELEROMETER '+axis) for axis in 'XYZ']
        gyro=[read(row,'GYROSCOPE '+axis) for axis in gyro_axes]
        available=not(outage and outage[0]<=elapsed<outage[1])
        f={'timestampMs':timestamp,'accel':accel,'gyro':gyro,'gnss':None,'gnssAvailable':available}
        if available and timestamp-last_fix>=1000:
            f['gnss']={'lat':read(row,'GPS LATITUDE'),'lon':read(row,'GPS LONGITUDE'),'accuracy':max(1,read(row,'GPS ACCURACY')),'heading':read(row,'GPS ORIENTATION'),'speedMps':read(row,'GPS SPEED')/3.6,'timestampMs':timestamp};last_fix=timestamp
        frames.append(f)
    if not frames:raise ValueError('No frames found')
    return {'schema':'navdr.frames.v1','provenance':{'source':'IO-VNBD smartphone CSV','sourceFile':Path(path).name,'sha256':hashlib.sha256(raw).hexdigest(),'dataset':'https://github.com/onyekpeu/IO-VNBD','reference':'none','gnssPolicy':'1 Hz sample-and-hold downsampling; logger has no per-fix timestamp','maskedOutageSeconds':outage,'gyroXYZColumns':gyro_axes},'mount':{'up':up,'forward':forward},'frames':frames}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('output');p.add_argument('--forward',required=True,type=vector,help='Vehicle forward direction in device XYZ');p.add_argument('--up',required=True,type=vector,help='Gravity up direction in device XYZ');p.add_argument('--gyro-xyz',required=True,nargs=3,choices=['Yaw','Pitch','Roll'],help='Logger column corresponding to device X, Y, Z');p.add_argument('--outage',type=float,nargs=2,metavar=('START_S','END_S'));p.add_argument('--limit',type=int)
    a=p.parse_args()
    if a.outage and not(0<=a.outage[0]<a.outage[1]):p.error('Outage must have 0 <= start < end')
    if len(set(a.gyro_xyz))!=3:p.error('Each gyro column must be used exactly once')
    try:result=convert(a.input,a.forward,a.up,a.gyro_xyz,a.outage,a.limit)
    except (ValueError,TypeError) as e:p.error(str(e))
    Path(a.output).write_text(json.dumps(result,allow_nan=False));print(f"Converted {len(result['frames'])} samples; no independent reference score")
if __name__=='__main__':main()
