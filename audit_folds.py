import json
from collections import defaultdict

print("=== NAVDR FOLD AUDIT ===")

for f in ["fold-1", "fold-2", "fold-3"]:
    d = json.load(open(f"data/folds/{f}.json"))

    groups = defaultdict(set)
    for t in d["trips"]:
        groups[t["recording_group"]].add(t["split"])

    leakage = {k: v for k, v in groups.items() if len(v) > 1}

    vf = [
        (t["id"], t["split"])
        for t in d["trips"]
        if t["recording_group"] == "Vf (Driver E)"
    ]

    print(f"\n{f}")
    print(f"  Test driver : {d['testDriver']}")
    print(f"  Vf trips    : {len(vf)}")
    print(f"  Vf splits   : {sorted(set(x[1] for x in vf))}")
    print(f"  Vf details  : {vf}")
    print(f"  Leakage     : {leakage if leakage else 'NONE'}")
