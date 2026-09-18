"""Strict, read-only raw IO-VNBD adapter. No directory discovery or pairing inference.

Only a reviewer supplies the manifest. A synthetic fixture manifest is accepted solely
by the private self-test call path. Whole CSVs are trip units; arbitrary row slicing is
not supported. Clock/unit/axis choices must be explicit, never magnitude guesses.
"""
import csv, hashlib, json, math
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

SCHEMA = 'navdr.approved-raw-split.v1'
CHANNELS = ('ax','ay','az','gx','gy','gz')
R = 6371000.0

def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def write_json(path, obj):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(json.dumps(obj, indent=2, allow_nan=False) + '\n'); temp.replace(path)

def require(condition, message):
    if not condition: raise ValueError(message)

def finite_number(x):
    return type(x) in (int, float) and math.isfinite(x)

def read_manifest(path, synthetic=False):
    require(path is not None, '--split-manifest is required for real runs')
    path = Path(path).resolve()
    with path.open() as f: m = json.load(f)
    require(isinstance(m,dict), 'Manifest must be a JSON object')
    require(not(set(m)-{'schema','synthetic','status','review','trips'}), 'Unknown manifest keys; row-level splits are unsupported')
    require(m.get('schema') == SCHEMA, 'Unsupported manifest schema; raw inventory is NOT approval')
    require(type(m.get('synthetic')) is bool, 'Manifest synthetic must be a boolean')
    if synthetic:
        require(m['synthetic'] and m.get('status') == 'SYNTHETIC_SELF_TEST', 'Only generated fixture manifests allowed in self-test')
    else:
        require(not m['synthetic'] and m.get('status') == 'APPROVED', 'STOP: explicit real approved manifest required')
        review = m.get('review', {})
        require(isinstance(review.get('reviewer'), str) and bool(review['reviewer'].strip()), 'Named human reviewer required')
        require(isinstance(review.get('reviewed_at'), str) and bool(review['reviewed_at'].strip()), 'Review date required')
        for field in ('pairings','clocks','units_axes_gravity','duplicates_and_overlap','split'):
            require(review.get(field) is True, 'Missing human approval: ' + field)
    require(isinstance(m.get('trips'), list) and m['trips'], 'Manifest trips must be a nonempty list')
    assignments = {}; ids = set(); splits = set()
    for t in m['trips']:
        require(isinstance(t,dict), 'Trip must be an object')
        require(not(set(t)-{'id','split','recording_group','vehicle_id','phone_id','route_id','unknown_group_rationale','phone','vehicle','clock','phone_gnss_time_policy','gnss_time_rationale','mount','outages'}), 'Unknown trip keys; row ranges must be separately reviewed files')
        require(isinstance(t.get('id'), str) and t['id'] and t['id'] not in ids, 'Duplicate/missing trip id')
        ids.add(t['id']); split = t.get('split'); splits.add(split)
        require(split in ('train','dev','test'), 'Invalid split for ' + t['id'])
        require(isinstance(t.get('recording_group'), str) and t['recording_group'], 'Reviewed recording_group required (aliases/overlaps together)')
        for key in ('recording_group','vehicle_id','phone_id','route_id'):
            require(key in t, 'Declare group key, or null with rationale: ' + key)
            value = t[key]
            if value is None:
                require(bool(t.get('unknown_group_rationale')), 'Unknown group needs reviewer rationale')
                continue
            require(isinstance(value, str) and value, 'Invalid group identifier')
            token = (key, value)
            require(assignments.setdefault(token, split) == split, 'Group leakage: ' + str(token))
        for kind in ('phone','vehicle'):
            spec = t.get(kind, {})
            require(isinstance(spec,dict) and not(set(spec)-{'path','sha256','encoding','columns'}), 'Unknown file specification keys; per-file row selectors are unsupported')
            require(isinstance(spec.get('path'), str) and spec['path'], 'Missing file path')
            file = (path.parent / spec['path']).resolve()
            require(file.is_file(), 'Missing file: ' + str(file))
            digest = spec.get('sha256','')
            require(isinstance(digest,str) and len(digest)==64 and all(c in '0123456789abcdef' for c in digest), 'Expected lowercase file SHA256')
            for token in (('payload',digest),('path',str(file))):
                require(assignments.setdefault(token,split)==split, 'Duplicate payload/path crosses splits: '+str(file))
            require(isinstance(spec.get('columns'),dict), 'Explicit columns required')
            required = CHANNELS + ('lat','lon','speed','bearing','accuracy') if kind=='phone' else ('speed',)
            require(set(required).issubset(spec['columns']), 'Missing '+kind+' column mapping')
            require(('lat' in spec['columns']) == ('lon' in spec['columns']), 'Reference lat/lon must be supplied together')
            for name, c in spec['columns'].items():
                require(isinstance(c,dict) and isinstance(c.get('column'),str) and finite_number(c.get('scale')) and c['scale']!=0, 'Each column needs a name and finite nonzero scale: '+name)
                require(set(c)=={'column','scale'}, 'Only explicit column/scale supported; offsets or rotations must not be silently ignored')
            require(isinstance(spec.get('encoding'),str), 'Explicit CSV encoding required')
            spec['_path'] = str(file)
        clock = t.get('clock',{})
        for field in ('phone_elapsed_column','phone_calendar_column','phone_calendar_format','vehicle_seconds_column','vehicle_date'):
            require(isinstance(clock.get(field),str) and clock[field], 'Explicit clock field required: '+field)
        for field in ('phone_utc_offset_seconds','vehicle_utc_offset_seconds','vehicle_alignment_offset_seconds','calendar_tolerance_seconds','max_reference_gap_seconds'):
            require(finite_number(clock.get(field)), 'Explicit finite clock value required: '+field)
        require(clock['calendar_tolerance_seconds']>=0 and clock['max_reference_gap_seconds']>0,'Invalid clock tolerances')
        require(clock.get('vehicle_midnight_policy') in ('reject','unwrap'), 'Explicit midnight policy required')
        require(t.get('phone_gnss_time_policy') == 'row_time_reviewed_assumption', 'Explicit GNSS row-time assumption required; source lacks fix-age tracking')
        require(isinstance(t.get('gnss_time_rationale'),str) and t['gnss_time_rationale'], 'Document GNSS timing assumption')
        mount=t.get('mount',{})
        require(mount.get('acceleration_includes_gravity') is True, 'Adapter requires explicitly mapped raw acceleration including gravity')
        up=np.asarray(mount.get('up'),dtype=float); forward=np.asarray(mount.get('forward'),dtype=float)
        require(up.shape==(3,) and forward.shape==(3,) and np.isfinite(up).all() and np.isfinite(forward).all(),'Invalid mount axes')
        require(np.linalg.norm(up)>1e-8,'Invalid up axis');up=up/np.linalg.norm(up)
        require(np.linalg.norm(forward-up*np.dot(up,forward))>1e-8,'Degenerate forward axis')
        require(isinstance(t.get('outages'),list),'Explicit outages list required (seconds from first phone row)')
        last=-1
        for outage in t['outages']:
            require(isinstance(outage,list) and len(outage)==2 and all(finite_number(v) for v in outage),'Invalid outage')
            start,end=outage
            require(0<=start<end and start>last,'Outages must be ordered, positive duration and disjoint');last=end
    require(splits=={'train','dev','test'},'Manifest must contain whole trips in train, dev and test')
    return m, sha(path)

def read_rows(spec):
    path=Path(spec['_path'])
    require(sha(path)==spec['sha256'],'Payload changed: '+str(path))
    with path.open(encoding=spec['encoding'],errors='strict',newline='') as f:
        reader=csv.DictReader(f,skipinitialspace=True)
        require(reader.fieldnames and len(reader.fieldnames)==len(set(reader.fieldnames)),'Missing/duplicate CSV header')
        rows=list(reader)
    require(len(rows)>=2,'Trip has fewer than two rows: '+str(path))
    return rows

def column(rows, spec, key, nullable=False):
    descriptor=spec['columns'].get(key)
    if descriptor is None:
        require(nullable,'Missing column: '+key);return np.full(len(rows),np.nan)
    name=descriptor['column'];scale=descriptor['scale'];values=[]
    for i,row in enumerate(rows):
        require(name in row, 'Missing CSV header: '+name)
        value=row[name]
        if nullable and (value is None or value.strip().lower() in ('','null','nan')): values.append(np.nan);continue
        try: value=float(value)*scale
        except (TypeError,ValueError): raise ValueError(f'Invalid {name} at CSV row {i+2}') from None
        require(math.isfinite(value),f'Nonfinite {name} at CSV row {i+2}');values.append(value)
    return np.array(values,dtype=np.float64)

def local(lat,lon,origin):
    return np.column_stack(((lat-origin[0])*math.pi/180*R,(lon-origin[1])*math.pi/180*R*math.cos(math.radians(origin[0]))))

def align_values(target, source, values, max_gap):
    """Linear offline reference interpolation only; never extrapolate or bridge large gaps."""
    ix=np.searchsorted(source,target);right=np.clip(ix,0,len(source)-1);left=np.maximum(right-1,0)
    exact=np.abs(source[right]-target)<1e-6
    valid=(target>=source[0]-1e-6)&(target<=source[-1]+1e-6)&((source[right]-source[left]<=max_gap)|exact)
    result=np.interp(target,source,values);result[~valid]=np.nan
    return result

def load_trip(t, period_seconds):
    """Called only for the requested split. Training never calls this on test trips."""
    p=read_rows(t['phone']);v=read_rows(t['vehicle']);c=t['clock']
    elapsed=np.array([float(r[c['phone_elapsed_column']])*.001 for r in p])
    require(np.isfinite(elapsed).all() and (np.diff(elapsed)>0).all(),'Phone elapsed clock must strictly increase; no automatic repairs')
    calendar=np.array([datetime.strptime(r[c['phone_calendar_column']],c['phone_calendar_format']).replace(tzinfo=timezone.utc).timestamp()-c['phone_utc_offset_seconds'] for r in p])
    relative=elapsed-elapsed[0];phone_time=calendar[0]+relative
    require(np.max(np.abs(calendar-phone_time))<=c['calendar_tolerance_seconds']+1e-6,'Phone calendar/elapsed clock mismatch')
    require(np.all(np.abs(np.diff(relative)-period_seconds)<=period_seconds*.1),'Phone cadence mismatch/gap; review or explicitly preprocess into reviewed trips')
    midnight=datetime.strptime(c['vehicle_date'],'%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp()
    seconds=np.array([float(r[c['vehicle_seconds_column']]) for r in v])
    require(np.isfinite(seconds).all() and ((seconds>=0)&(seconds<86400)).all(),'Vehicle seconds must be within a day')
    day=0;unwrapped=[]
    for i,s in enumerate(seconds):
        if i and s<seconds[i-1]:
            require(c['vehicle_midnight_policy']=='unwrap' and seconds[i-1]>23*3600 and s<3600,'Unapproved vehicle clock reset')
            day+=86400
        unwrapped.append(s+day)
    vt=midnight+np.array(unwrapped)-c['vehicle_utc_offset_seconds']+c['vehicle_alignment_offset_seconds']
    require((np.diff(vt)>0).all(),'Vehicle clock must strictly increase')
    x=np.column_stack([column(p,t['phone'],k) for k in CHANNELS])
    speed=align_values(phone_time,vt,column(v,t['vehicle'],'speed'),c['max_reference_gap_seconds'])
    gps=np.column_stack([column(p,t['phone'],k,True) for k in ('lat','lon','speed','bearing','accuracy')])
    validgps=np.isfinite(gps).all(1)&(gps[:,4]>0)&(gps[:,4]<=50)&(gps[:,2]>2)&(gps[:,2]<=60)&(np.abs(gps[:,0])<85)&(np.abs(gps[:,1])<=180)&(gps[:,3]>=0)&(gps[:,3]<=360)
    origin=gps[np.flatnonzero(validgps)[0],:2] if validgps.any() else np.array([0.,0.])
    ref_lat=align_values(phone_time,vt,column(v,t['vehicle'],'lat',True),c['max_reference_gap_seconds'])
    ref_lon=align_values(phone_time,vt,column(v,t['vehicle'],'lon',True),c['max_reference_gap_seconds'])
    require(np.all(np.abs(ref_lat[np.isfinite(ref_lat)])<85) and np.all(np.abs(ref_lon[np.isfinite(ref_lon)])<=180),'Reference coordinate outside supported geographic range')
    ref=local(ref_lat,ref_lon,origin);gpsxy=local(gps[:,0],gps[:,1],origin)
    mask=np.zeros(len(p),dtype=bool)
    for start,end in t['outages']:
        require(end<=relative[-1]+1e-6,'Outage outside phone recording')
        selected=(relative>start+1e-6)&(relative<=end+1e-6)
        require(selected.any(),'Outage has no samples');mask|=selected
    up=np.array(t['mount']['up'],dtype=float);up/=np.linalg.norm(up)
    f=np.array(t['mount']['forward'],dtype=float);f-=up*np.dot(f,up);f/=np.linalg.norm(f)
    return dict(t=relative,x=x,y=speed,gps=gps,gpsxy=gpsxy,validgps=validgps,reference=ref,outage=mask,origin=origin,up=up,forward=f)
