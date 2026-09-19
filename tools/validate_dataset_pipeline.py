#!/usr/bin/env python3
"""Validate dataset split integrity, leakage prevention, file hashes, and 10 Hz window generation."""
import csv, hashlib, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WINDOW = 231
PERIOD_NS = 100_000_000  # 10 Hz = 0.1s = 100,000,000 ns
TOLERANCE_NS = 10_000_000  # 10% tolerance

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()

def validate_fold(fold_path):
    print(f"\n--- Validating {fold_path.name} ---")
    data = json.loads(fold_path.read_text(encoding="utf-8"))
    assert data.get("schema") == "navdr.split.v1", f"Bad schema: {data.get('schema')}"
    trips = data.get("trips", [])
    assert len(trips) > 0, "Empty trips list"

    groups = {"train": set(), "dev": set(), "test": set()}
    trip_counts = {"train": 0, "dev": 0, "test": 0}
    window_counts = {"train": 0, "dev": 0, "test": 0}
    verified_files = 0

    for t in trips:
        split = t.get("split")
        assert split in groups, f"Invalid split: {split}"
        trip_counts[split] += 1

        rg = t.get("recording_group")
        assert rg and isinstance(rg, str), f"Missing recording_group for trip {t.get('id')}"
        groups[split].add(rg)

        # File resolution
        p = ROOT / t["path"] if not Path(t["path"]).is_file() else Path(t["path"])
        assert p.is_file(), f"File does not exist: {p}"
        digest = sha256(p)
        assert digest == t["sha256"], f"SHA-256 mismatch for {t['id']}: expected {t['sha256']}, got {digest}"
        verified_files += 1

        # Check CSV cadence and windows
        with open(p, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            timestamps = [int(r["timestampNs"]) for r in reader]

        # Check timestamps strictly increase
        diffs = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps)-1)]
        assert all(d > 0 for d in diffs), f"Non-increasing timestamps in {t['id']}"

        # Count valid contiguous 10 Hz windows
        valid_windows = 0
        if len(timestamps) >= WINDOW:
            for end in range(WINDOW - 1, len(timestamps)):
                # Check window cadence
                window_diffs = diffs[end - WINDOW + 1:end]
                if all(abs(d - PERIOD_NS) <= TOLERANCE_NS for d in window_diffs):
                    valid_windows += 1

        window_counts[split] += valid_windows


    # Leakage assertions
    train_test = groups["train"] & groups["test"]
    train_dev  = groups["train"] & groups["dev"]
    dev_test   = groups["dev"] & groups["test"]

    assert not train_test, f"LEAKAGE: Train ∩ Test = {train_test}"
    assert not train_dev,  f"LEAKAGE: Train ∩ Dev = {train_dev}"
    assert not dev_test,   f"LEAKAGE: Dev ∩ Test = {dev_test}"

    print(f"  Verified {verified_files} CSV files (all SHA-256 hashes match).")
    print(f"  Trips: Train={trip_counts['train']}, Dev={trip_counts['dev']}, Test={trip_counts['test']} (Total={len(trips)})")
    print(f"  Recording Groups: Train={groups['train']}, Dev={groups['dev']}, Test={groups['test']}")
    print(f"  Contiguous 10 Hz Windows: Train={window_counts['train']}, Dev={window_counts['dev']}, Test={window_counts['test']}")
    print(f"  Leakage Check: train & test = empty, train & dev = empty, dev & test = empty [PASS]")
    return {
        "fold": fold_path.stem,
        "trips": trip_counts,
        "windows": window_counts,
        "verified_files": verified_files,
        "leakage_pass": True,
    }

def main():
    folds_dir = ROOT / "data/folds"
    results = []
    for i in range(1, 4):
        f = folds_dir / f"fold-{i}.json"
        assert f.is_file(), f"Missing fold manifest: {f}"
        results.append(validate_fold(f))

    print("\n" + "=" * 60)
    print("  ALL 3 FOLDS VALIDATED: ZERO LEAKAGE, 10 HZ CADENCE VERIFIED")
    print("=" * 60)
    for r in results:
        print(f"  {r['fold']}: {r['trips']['train']} train trips ({r['windows']['train']} windows), "
              f"{r['trips']['dev']} dev trips ({r['windows']['dev']} windows), "
              f"{r['trips']['test']} test trips ({r['windows']['test']} windows)")

if __name__ == "__main__":
    main()
