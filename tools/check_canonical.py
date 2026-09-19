"""Quick sanity check on canonical CSVs. Flags trips with suspicious stats."""
import csv, json, sys
from pathlib import Path

def check(csv_path):
    rows = []
    with open(csv_path) as f:
        for row in csv.DictReader(f):
            rows.append(row)
    if not rows:
        return {"status": "EMPTY"}

    speeds = [float(r["speedMps"]) for r in rows]
    ax     = [float(r["ax"]) for r in rows]

    max_spd  = max(speeds)
    mean_spd = sum(speeds) / len(speeds)
    pct_zero = sum(1 for s in speeds if s < 0.5) / len(speeds)
    max_ax   = max(abs(v) for v in ax)
    n        = len(rows)

    flags = []
    if max_spd < 1.0:           flags.append("ALWAYS_STATIONARY")
    if max_spd > 60.0:          flags.append("SPEED_OVER_60MPS_SUSPECT")
    if pct_zero > 0.95:         flags.append("95PCT_ZERO_SPEED")
    if max_ax > 50.0:           flags.append("ACCEL_SPIKE_OVER_50")
    if n < 100:                 flags.append("VERY_SHORT_TRIP")

    status = "WARN" if flags else "OK"
    return {
        "status"    : status,
        "rows"      : n,
        "maxSpeedMps": round(max_spd, 2),
        "meanSpeedMps": round(mean_spd, 2),
        "pctZeroSpeed": round(pct_zero * 100, 1),
        "maxAccelMs2": round(max_ax, 2),
        "flags"     : flags,
    }

canonical_dir = Path("data/canonical")
results = {}
for csv_path in sorted(canonical_dir.glob("*.csv")):
    results[csv_path.stem] = check(csv_path)

ok    = {k: v for k, v in results.items() if v["status"] == "OK"}
warn  = {k: v for k, v in results.items() if v["status"] == "WARN"}

print(f"\n{'='*60}")
print(f"  Total trips: {len(results)}")
print(f"  OK   : {len(ok)}")
print(f"  WARN : {len(warn)}")
print(f"{'='*60}\n")

if warn:
    print("⚠️  Trips needing your attention:\n")
    for trip_id, info in warn.items():
        print(f"  {trip_id:20s}  rows={info['rows']:6d}  maxSpd={info['maxSpeedMps']:6.1f}m/s  "
              f"flags={info['flags']}")
else:
    print("✅  No suspicious trips detected.\n")

print("\n✅  Trips that look clean:\n")
for trip_id, info in ok.items():
    print(f"  {trip_id:20s}  rows={info['rows']:6d}  maxSpd={info['maxSpeedMps']:6.1f}m/s  "
          f"mean={info['meanSpeedMps']:5.2f}m/s")

out = Path("data/quality_check.json")
out.write_text(json.dumps(results, indent=2))
print(f"\nFull report saved to {out}")
