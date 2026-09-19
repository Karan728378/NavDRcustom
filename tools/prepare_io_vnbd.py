"""
IO-VNBD → NavDR canonical CSV adapter.

Reads phone (S-*.csv) + vehicle (V-*.csv) pairs from the Synchronised
Categorised dataset, applies the unit conversions documented in the
Onyekpe et al. paper, performs gravity-based phone-frame correction,
resamples both streams to 10 Hz, aligns them on GPS speed, and writes
one canonical CSV per trip:

    timestampNs, ax, ay, az, gx, gy, gz, speedMps

Output also includes a proposed raw inventory JSON that can be fed to
ml/split.py.  The inventory is a DRAFT — no pairing is marked approved
until the user reviews it.

Usage:
    python3 tools/prepare_io_vnbd.py \\
        --dataset  "IO-VNBD-master/Synchronised V abd S datasets/Categorised IOVNB Dataset" \\
        --output   data/canonical \\
        --inventory data/proposed_inventory.json

The script never edits or deletes the source CSVs.
"""
import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Constants from the Onyekpe et al. paper
# ---------------------------------------------------------------------------
G_TO_MS2   = 9.80665          # vehicle accel is in g; phone accel already m/s²
DEG_PER_S_TO_RAD = np.pi / 180.0   # vehicle yaw rate is deg/s; phone gyro already rad/s
KMH_TO_MPS = 1.0 / 3.6        # both speed columns are km/h → m/s
TARGET_HZ  = 10.0             # resample target
TARGET_DT  = 1.0 / TARGET_HZ  # 0.1 s


# ---------------------------------------------------------------------------
# Phone CSV parser
# ---------------------------------------------------------------------------
def _parse_phone(path: Path) -> np.ndarray:
    """Return float64 array [N, 11]:
    0  t_ms              TIME SINCE START (ms)
    1  ax_raw            ACCELEROMETER X (m/s²)
    2  ay_raw            ACCELEROMETER Y (m/s²)
    3  az_raw            ACCELEROMETER Z (m/s²)
    4  grav_x            GRAVITY X (m/s²)
    5  grav_y            GRAVITY Y (m/s²)
    6  grav_z            GRAVITY Z (m/s²)
    7  gyro_yaw          GYROSCOPE Yaw (rad/s)
    8  gyro_pitch        GYROSCOPE Pitch (rad/s)
    9  gyro_roll         GYROSCOPE Roll (rad/s)
    10 gps_speed_kmh     GPS SPEED (Kmh)
    """
    rows = []
    with path.open(encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader)
        # strip BOM / whitespace / squared-unit characters robustly
        header = [re.sub(r"[^\x20-\x7E]", "", h).strip() for h in header]
        col = {h: i for i, h in enumerate(header)}

        def c(name):
            for k in col:
                if name.lower() in k.lower():
                    return col[k]
            raise KeyError(f"Column not found: {name!r} in {path.name}")

        i_t   = c("TIME SINCE START")
        i_ax  = c("ACCELEROMETER X")
        i_ay  = c("ACCELEROMETER Y")
        i_az  = c("ACCELEROMETER Z")
        i_gx  = c("GRAVITY X")
        i_gy  = c("GRAVITY Y")
        i_gz  = c("GRAVITY Z")
        i_wy  = c("GYROSCOPE Yaw")
        i_wp  = c("GYROSCOPE Pitch")
        i_wr  = c("GYROSCOPE Roll")
        i_spd = c("GPS SPEED")

        for row in reader:
            if not row or row[0].strip().startswith("#"):
                continue
            try:
                rows.append([
                    float(row[i_t]),
                    float(row[i_ax]), float(row[i_ay]), float(row[i_az]),
                    float(row[i_gx]), float(row[i_gy]), float(row[i_gz]),
                    float(row[i_wy]), float(row[i_wp]), float(row[i_wr]),
                    float(row[i_spd]),
                ])
            except (ValueError, IndexError):
                continue

    if len(rows) < 2:
        raise ValueError(f"Too few rows in {path}")
    return np.array(rows, dtype=np.float64)


# ---------------------------------------------------------------------------
# Vehicle CSV parser
# ---------------------------------------------------------------------------
def _parse_vehicle(path: Path) -> np.ndarray:
    """Return float64 array [N, 3]:
    0  t_s          Time Since Start of Day (seconds)
    1  speed_kmh    Velocity (km/hr)
    2  yaw_deg_s    Yaw Rate (deg/sec)   — kept for reference, not used in output
    """
    rows = []
    with path.open(encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader)
        header = [re.sub(r"[^\x20-\x7E]", "", h).strip() for h in header]
        col = {h: i for i, h in enumerate(header)}

        def c(name):
            for k in col:
                if name.lower() in k.lower():
                    return col[k]
            raise KeyError(f"Column not found: {name!r} in {path.name}")

        i_t   = c("Time Since Start of Day")
        i_spd = c("Velocity")
        i_yaw = c("Yaw Rate")

        for row in reader:
            if not row or row[0].strip().startswith("#"):
                continue
            try:
                rows.append([
                    float(row[i_t]),
                    float(row[i_spd]),
                    float(row[i_yaw]),
                ])
            except (ValueError, IndexError):
                continue

    if len(rows) < 2:
        raise ValueError(f"Too few rows in {path}")
    return np.array(rows, dtype=np.float64)


# ---------------------------------------------------------------------------
# Gravity-based frame correction
# ---------------------------------------------------------------------------
def _remove_gravity_and_align(phone: np.ndarray) -> np.ndarray:
    """
    Subtract gravity vector from raw accelerometer and rotate phone axes
    into a vehicle-forward frame using the mean gravity direction.

    The paper states phone +x ≈ direction of travel when flat on dashboard.
    We compute a rotation R that maps the mean gravity vector to [0,0,-g]
    (i.e., the phone's z-axis pointing up in the vehicle frame) and apply R
    to both accel and gyro columns.

    Returns array same shape as phone with columns 1-9 corrected.
    """
    result = phone.copy()

    ax_raw = phone[:, 1]
    ay_raw = phone[:, 2]
    az_raw = phone[:, 3]
    gx     = phone[:, 4]
    gy     = phone[:, 5]
    gz     = phone[:, 6]

    # Linear acceleration = raw accel - gravity vector
    result[:, 1] = ax_raw - gx
    result[:, 2] = ay_raw - gy
    result[:, 3] = az_raw - gz

    # Mean gravity direction → estimate phone orientation relative to vehicle
    g_mean = np.array([gx.mean(), gy.mean(), gz.mean()])
    g_norm = g_mean / (np.linalg.norm(g_mean) + 1e-9)

    # We want g_norm to map to [0, 0, -1] (gravity down in vehicle frame).
    # Build rotation via Rodrigues: rotate around the cross product axis.
    target = np.array([0.0, 0.0, -1.0])
    axis   = np.cross(g_norm, target)
    s      = np.linalg.norm(axis)
    c_val  = float(np.dot(g_norm, target))

    if s < 1e-6:
        # Already aligned — no rotation needed
        R = np.eye(3)
    else:
        axis /= s
        K = np.array([
            [0,        -axis[2],  axis[1]],
            [axis[2],   0,       -axis[0]],
            [-axis[1],  axis[0],  0      ],
        ])
        R = np.eye(3) + s * K + (1 - c_val) * K @ K

    # Apply R to corrected accel and to gyro
    accel_corrected = (R @ np.stack([result[:, 1], result[:, 2], result[:, 3]])).T
    gyro_corrected  = (R @ np.stack([phone[:, 7],  phone[:, 8],  phone[:, 9]])).T

    result[:, 1:4] = accel_corrected
    result[:, 7:10] = gyro_corrected

    return result


# ---------------------------------------------------------------------------
# Resample to TARGET_HZ using linear interpolation
# ---------------------------------------------------------------------------
def _resample(t_orig: np.ndarray, data: np.ndarray, t_uniform: np.ndarray) -> np.ndarray:
    """Linear interpolation of data rows onto t_uniform grid."""
    out = np.zeros((len(t_uniform), data.shape[1]), dtype=np.float64)
    for col in range(data.shape[1]):
        out[:, col] = np.interp(t_uniform, t_orig, data[:, col])
    return out


# ---------------------------------------------------------------------------
# Core per-trip processor
# ---------------------------------------------------------------------------
def process_trip(phone_path: Path, vehicle_path: Path, out_path: Path) -> dict:
    """
    Process one phone+vehicle pair → write canonical CSV → return metadata.
    """
    phone_raw   = _parse_phone(phone_path)
    vehicle_raw = _parse_vehicle(vehicle_path)

    # --- Phone time axis: ms → seconds (relative to first sample) ----------
    t_phone_s = (phone_raw[:, 0] - phone_raw[0, 0]) / 1000.0

    # --- Vehicle time axis: already relative seconds at 10 Hz --------------
    # The paper states vehicle logs at 10 Hz; time column is "since start of day".
    # Make relative to first vehicle sample.
    t_veh_s = vehicle_raw[:, 0] - vehicle_raw[0, 0]

    # Gravity correction + frame alignment on phone data
    phone_corrected = _remove_gravity_and_align(phone_raw)

    # Determine overlap window (both streams start near 0; we use the shorter)
    t_start = 0.0
    t_end   = min(t_phone_s[-1], t_veh_s[-1])
    if t_end < 1.0:
        raise ValueError("Trip overlap < 1 second; skipping")

    n_samples   = int((t_end - t_start) * TARGET_HZ)
    t_uniform   = np.linspace(t_start, t_end, n_samples)

    # Resample phone channels (ax,ay,az,gx,gy,gz from corrected) + GPS speed
    phone_interp = _resample(
        t_phone_s,
        phone_corrected[:, [1, 2, 3, 7, 8, 9, 10]],  # ax,ay,az,wy,wp,wr,gps_speed
        t_uniform,
    )

    # Resample vehicle speed (km/h → m/s)
    veh_speed_mps = _resample(
        t_veh_s,
        vehicle_raw[:, 1:2],   # Velocity column only
        t_uniform,
    )[:, 0] * KMH_TO_MPS

    # Use vehicle speed as the ground-truth speed label (more accurate VBOX GPS)
    speed_mps = veh_speed_mps

    # Build canonical array: timestampNs, ax, ay, az, gx, gy, gz, speedMps
    t_ns = (t_uniform * 1e9).astype(np.int64)
    canonical = np.column_stack([
        t_ns.astype(np.float64),
        phone_interp[:, 0],   # ax (m/s²)
        phone_interp[:, 1],   # ay
        phone_interp[:, 2],   # az
        phone_interp[:, 3],   # gx (rad/s)
        phone_interp[:, 4],   # gy
        phone_interp[:, 5],   # gz
        speed_mps,            # speedMps
    ])

    # Sanity: drop rows where speed < 0 or not finite
    ok = np.isfinite(canonical).all(axis=1) & (canonical[:, 7] >= 0)
    canonical = canonical[ok]
    if len(canonical) < 20:
        raise ValueError("Too few usable rows after sanity filter")

    # Write canonical CSV
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestampNs", "ax", "ay", "az", "gx", "gy", "gz", "speedMps"])
        for row in canonical:
            w.writerow([int(row[0])] + [f"{v:.6f}" for v in row[1:]])

    sha256 = hashlib.sha256(out_path.read_bytes()).hexdigest()
    return {
        "rows"       : len(canonical),
        "durationS"  : float(t_end),
        "sha256"     : sha256,
        "canonicalPath": str(out_path),
    }


# ---------------------------------------------------------------------------
# Dataset scanner
# ---------------------------------------------------------------------------
def scan_dataset(dataset_root: Path) -> list[tuple[Path, Path, str]]:
    """
    Return list of (phone_csv, vehicle_csv, trip_id) for every folder
    that contains exactly one S-*.csv and one V-*.csv.
    """
    pairs = []
    for folder in sorted(dataset_root.rglob("*")):
        if not folder.is_dir():
            continue
        s_files = list(folder.glob("S-*.csv"))
        v_files = list(folder.glob("V-*.csv")) + list(folder.glob("V-*.csv".lower()))
        # case-insensitive fallback
        if not v_files:
            v_files = [f for f in folder.iterdir()
                       if f.suffix.lower() == ".csv" and f.stem.lower().startswith("v-")]
        if len(s_files) == 1 and len(v_files) == 1:
            trip_id = folder.name  # e.g. "S1", "Vta01a"
            pairs.append((s_files[0], v_files[0], trip_id))
    return pairs


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset",   required=True, type=Path,
                    help="Root of 'Categorised IOVNB Dataset'")
    ap.add_argument("--output",    required=True, type=Path,
                    help="Directory to write canonical CSVs")
    ap.add_argument("--inventory", required=True, type=Path,
                    help="Path to write proposed inventory JSON (input for ml/split.py)")
    ap.add_argument("--dry-run",   action="store_true",
                    help="Scan and report pairs without writing any files")
    args = ap.parse_args()

    pairs = scan_dataset(args.dataset)
    if not pairs:
        sys.exit("No S-/V- pairs found in dataset root.")

    print(f"Found {len(pairs)} trip pairs. {'(dry run)' if args.dry_run else 'Processing...'}")

    trips   = []
    errors  = []
    seen_hashes: dict[str, str] = {}   # sha256 → first trip_id

    for phone_csv, vehicle_csv, trip_id in pairs:
        # Derive driver/route from parent directory names
        parts = phone_csv.parts
        driver = next((p for p in parts if "Driver" in p), "unknown")
        route  = trip_id

        if args.dry_run:
            print(f"  PAIR  {trip_id:20s}  phone={phone_csv.name}  vehicle={vehicle_csv.name}  driver={driver}")
            continue

        out_csv = args.output / f"{trip_id}.csv"
        try:
            meta = process_trip(phone_csv, vehicle_csv, out_csv)
        except Exception as exc:
            print(f"  ERROR {trip_id}: {exc}", file=sys.stderr)
            errors.append({"id": trip_id, "error": str(exc)})
            continue

        # Duplicate detection by canonical output hash
        if meta["sha256"] in seen_hashes:
            print(f"  DUPE  {trip_id} is identical to {seen_hashes[meta['sha256']]} — skipping")
            out_csv.unlink(missing_ok=True)
            errors.append({"id": trip_id, "error": f"duplicate of {seen_hashes[meta['sha256']]}"})
            continue

        seen_hashes[meta["sha256"]] = trip_id

        trip_record = {
            "id"    : trip_id,
            "path"  : str(out_csv),
            "sha256": meta["sha256"],
            "driver": driver,
            "vehicle": "io-vnbd-vehicle",    # single shared vehicle in dataset
            "phone"  : "io-vnbd-phone",      # single shared phone type
            "route"  : route,
            "rows"   : meta["rows"],
            "durationS": meta["durationS"],
            "approved": False,               # USER must set to true after review
            "notes"  : "",
        }
        trips.append(trip_record)
        print(f"  OK    {trip_id:20s}  rows={meta['rows']}  duration={meta['durationS']:.1f}s")

    if args.dry_run:
        return

    inventory = {
        "schema"  : "navdr.raw-inventory.v1",
        "status"  : "PROPOSED_REQUIRES_USER_REVIEW",
        "source"  : "IO-VNBD Synchronised Categorised dataset",
        "note"    : ("All pairings are folder-name based. "
                     "Set 'approved': true on each trip after verifying "
                     "clock alignment, axis signs, and data quality. "
                     "Feed to ml/split.py only after review."),
        "trips"   : trips,
        "errors"  : errors,
    }
    args.inventory.parent.mkdir(parents=True, exist_ok=True)
    args.inventory.write_text(json.dumps(inventory, indent=2))

    print(f"\nDone. {len(trips)} trips written to {args.output}")
    print(f"Proposed inventory: {args.inventory}")
    print(f"Errors/skipped:     {len(errors)}")
    print("\nNEXT STEP: Open the inventory JSON, review each trip entry,")
    print("set 'approved': true on the ones you confirm, then run ml/split.py.")


if __name__ == "__main__":
    main()
