#!/usr/bin/env python3
"""Read-only IO-VNBD inventory. Filename pairing candidates are NEVER approved labels.
Reports LFS pointers without downloading them. CSV statistics are bounded-prefix diagnostics.
"""
import argparse,collections,csv,hashlib,json,math,re,statistics
from pathlib import Path


def finite(value):
    try:
        n=float(value)
        return n if math.isfinite(n) else None
    except (TypeError,ValueError):return None


def csv_probe(path,limit):
    """No unit/axis/clock alignment is inferred when headers do not declare it."""
    with path.open(encoding='utf-8-sig',errors='backslashreplace',newline='') as f:
        reader=csv.DictReader(f,skipinitialspace=True);headers=reader.fieldnames
        if not headers:raise ValueError('Missing CSV header')
        time_headers=[h for h in headers if 'time' in h.lower()]
        times={h:[] for h in time_headers};bad=collections.Counter();rows=0;first_row=None
        for row in reader:
            if rows==limit:break
            rows+=1
            if first_row is None:first_row=row.copy()
            for h in time_headers:
                n=finite(row.get(h))
                if n is None:bad[h]+=1
                else:times[h].append(n)
        else:row=None
        stats={}
        for h,values in times.items():
            deltas=[b-a for a,b in zip(values,values[1:])]
            positive=[x for x in deltas if x>0]
            # Conversion only for explicit header units, not magnitude-based guesses.
            unit=re.search(r'[\[(]\s*(ns|us|µs|ms|s|seconds?|milliseconds?)\s*[\])]',h,re.I)
            u=unit[1].lower() if unit else None
            scale={'ns':1e-9,'us':1e-6,'µs':1e-6,'ms':1e-3,'millisecond':1e-3,'milliseconds':1e-3,'s':1,'second':1,'seconds':1}.get(u)
            median=statistics.median(positive) if positive else None
            stats[h]=dict(firstRaw=values[0] if values else None,lastRaw=values[-1] if values else None,
                medianPositiveDeltaRaw=median,headerDeclaredUnit=u,cadenceHz=1/(median*scale) if median and scale else None,
                nonIncreasingDeltas=sum(d<=0 for d in deltas),nonNumericRows=bad[h],
                clockOrigin='unverified; a first timestamp is not a phone/vehicle clock offset')
        return dict(status='csv_prefix_inspected',rowsInspected=rows,prefixLimit=limit,truncated=row is not None,
            headers=headers,decodePolicy='utf-8-sig with undecodable bytes preserved as \\xNN escapes',
            headersWithByteEscapes=[h for h in headers if re.search(r'\\x[0-9a-fA-F]{2}',h)],
            headerUnitAnnotations={h:[a or b for a,b in re.findall(r'\(([^)]+)\)|\[([^]]+)\]',h)] for h in headers if '(' in h or '[' in h},
            firstRowClockLabels={h:first_row.get(h) for h in headers if first_row and ('time' in h.lower() or h.lower().startswith('date'))},
            axisLabeledHeaders=[h for h in headers if re.search(r'\b(X|Y|Z|Yaw|Pitch|Roll)\b',h,re.I)],
            deviceToVehicleAxisMapping=None,timestampStatistics=stats,approvedForTraining=False)


def inventory(root,limit=4096):
    if not root.is_dir():raise ValueError('Dataset directory does not exist')
    files=[];groups=collections.defaultdict(lambda:{'S':[],'V':[]});counts=collections.Counter();objects={};payload_hashes=collections.defaultdict(list)
    for p in sorted(root.rglob('*')):
        if not p.is_file() or p.is_symlink():continue
        rel=p.relative_to(root).as_posix();entry=dict(path=rel,localBytes=p.stat().st_size)
        with p.open('rb') as stream:prefix=stream.read(1024)
        if prefix.startswith(b'version https://git-lfs.github.com/spec/v1'):
            oid=re.search(rb'oid sha256:([a-f0-9]{64})\s',prefix);size=re.search(rb'\nsize (\d+)',prefix)
            entry.update(status='lfs_pointer_missing_payload',pointerText=prefix.decode('utf-8'),
                lfsOid=oid[1].decode() if oid else None,declaredPayloadBytes=int(size[1]) if size else None)
            if oid and size:objects[oid[1].decode()]=int(size[1])
            counts['lfsPointerFiles']+=1
        else:entry['status']='local_content'
        if p.suffix.lower()=='.csv':
            counts['csvFiles']+=1
            if entry['status']=='lfs_pointer_missing_payload':
                counts['csvPointers']+=1;entry['measurements']=dict(status='UNAVAILABLE_LFS_PAYLOAD_MISSING',units=None,axes=None,cadenceHz=None,timestamps=None)
            else:
                counts['csvPayloadFiles']+=1
                with p.open('rb') as stream:entry['sha256']=hashlib.file_digest(stream,'sha256').hexdigest()
                payload_hashes[entry['sha256']].append(rel)
                try:entry['measurements']=csv_probe(p,limit)
                except (ValueError,OSError,UnicodeError,csv.Error) as e:entry['measurements']=dict(status='probe_error',error=str(e))
            m=re.match(r'^([SV])-(.+)$',p.stem,re.I)
            if m:
                variant=next((part for part in p.relative_to(root).parts if part.lower().startswith(('synchronised','unsynchronised'))),'unknown')
                # Literal stem matching only, case-insensitive. Do not invent zero-padding or trip-ID mapping.
                key=(variant,m[2].lower());groups[key][m[1].upper()].append(rel)
        files.append(entry)
    candidates=[]
    by_path={f['path']:f for f in files}
    for (variant,stem),g in sorted(groups.items()):
        if g['S'] and g['V']:
            candidates.append(dict(variant=variant,literalTripStem=stem,phonePaths=g['S'],vehiclePaths=g['V'],
                basis='matching S-/V- filename suffix within same named collection; filenames only',
                measuredClockOffsetSeconds=None,trustworthiness='UNREVIEWED',approvedForTraining=False,
                firstRowClockEvidence=[dict(path=p,labels=by_path[p].get('measurements',{}).get('firstRowClockLabels'),
                    timestamps=by_path[p].get('measurements',{}).get('timestampStatistics')) for p in g['S']+g['V']]))
    return dict(schema='navdr.io-vnbd-inventory.v1',root=str(root.resolve()),
        summary=dict(totalFiles=len(files),csvFiles=counts['csvFiles'],csvPointers=counts['csvPointers'],csvPayloadFiles=counts['csvPayloadFiles'],
            allLfsPointerFiles=counts['lfsPointerFiles'],uniqueMissingLfsObjects=len(objects),uniqueDeclaredPayloadBytes=sum(objects.values()),
            filenameCandidateGroups=len(candidates),approvedPairings=0,uniqueCsvPayloads=len(payload_hashes),
            duplicateCsvPayloadGroups=sum(len(paths)>1 for paths in payload_hashes.values())),
        status='BLOCKED_MISSING_CSV_PAYLOADS' if not counts['csvPayloadFiles'] else 'REQUIRES_HUMAN_DATA_REVIEW',
        limitations=['No download, extraction, split or training performed.',
            'Candidate groups can contain categorized/uncategorized aliases and are not distinct-trip counts.',
            'No phone/vehicle timestamp offsets are inferred from filenames or relative clock starts.',
            'Header units are declarations, not calibrated validation; physical axes require manual review.',
            'CSV numerical parsing is a bounded prefix, not a full-trip quality certification.'],
        duplicateCsvPayloads=[dict(sha256=oid,paths=paths) for oid,paths in sorted(payload_hashes.items()) if len(paths)>1],
        files=files,candidatePairings=candidates)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--max-rows',type=int,default=4096);a=p.parse_args()
    if not 2<=a.max_rows<=100000:p.error('max-rows must be 2..100000')
    try:
        result=inventory(a.root,a.max_rows);a.output.parent.mkdir(parents=True,exist_ok=True)
        with a.output.open('x') as f:json.dump(result,f,indent=2,allow_nan=False);f.write('\n')
        print(json.dumps({'status':result['status'],**result['summary'],'rawInventory':str(a.output)},indent=2))
    except (ValueError,OSError) as e:p.exit(1,str(e)+'\n')
