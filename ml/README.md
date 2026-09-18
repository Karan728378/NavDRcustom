# NavDR standalone training and evaluation

This guide is sufficient to run the synthetic self-test now and user-operated experiments later. **No real approved manifest exists yet.** Do not rename the raw inventory, pairing candidates or synthetic manifest to make them appear approved. You must first review the real pairs, clocks, units, axes, duplicate/overlapping recordings and actual split. This pipeline does not make those decisions.

The new entry points are `ml/train.py` and `ml/evaluate.py`. They use the [strict raw-data adapter](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/raw_data.py:31), [epoch/resume implementation](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/training_runner.py:80), and [four-method evaluator](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/evaluation_runner.py:83). Prior canonical-CSV modules remain for historical toy acceptance; their positional CLI examples are superseded by this guide. Model topology is the existing 49,665-parameter TCN from `ml/model.py`; this does not choose a production architecture or train the Android app automatically.

**Executed acceptance, 16 September 2026:** the [full self-test](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/ml-standalone-final/acceptance.json:1) passed. [Raw console output](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/ml-standalone-final/run.log:1) records two epochs, 86 updates, bitwise-equal resumed weights and all four evaluators on 171 common synthetic test samples. [The resulting report](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/ml-standalone-final/evaluation/report.md:1) includes every method and outage. Actual [CLI refusal tests](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/ml-standalone-final/cli-refusals.json:1) returned exit 1 for missing manifests and attempts to pass fixture manifests into real training/evaluation. The separate [GPU probe](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/ml-gpu-probe-standalone.json:1) returned exit 2: NVIDIA driver communication unavailable; budget unverified. No real data was opened in this implementation acceptance, and no real approved pairing/split was created.

## Fast start on this Linux RTX 4050 laptop

The host was checked directly: **Nitro NL16-71G, i5-13420H (12 logical CPUs), RTX 4050 Laptop GPU (6,141 MiB VRAM), about 15 GiB system RAM**. `nvidia-smi` works on the host; the restricted agent sandbox hides `/dev/nvidia*`. Use your laptop terminal for the following commands. No driver installation, overclocking or power-limit change is part of this setup.

```bash
cd /home/rimuru/Downloads/Antigravity/SIH_Pototype
bash ml/setup_gpu.sh
bash ml/train_gpu.sh --check
```

Setup creates/updates only `.local-tools/ml-cuda`, installs pinned Torch 2.10.0 and NumPy 2.2.6 from PyPI, records `ml/requirements.cuda.local.lock`, and checks CUDA. The CPU environment stays separate. If setup was already completed successfully, skip it and run the check. A failed download is safe to retry: `uv` reuses cached downloads. Disk space is needed for several GB of CUDA libraries. No system CUDA toolkit installation is required by these wheels.

**You still need your manually approved manifest.** No real pairing/split was created by the launcher. Until then you can safely measure the GPU with synthetic inputs only:

```bash
bash ml/train_gpu.sh --tune-only --run-dir runs/gpu-profile-001
```

After reviewing/creating the manifest using section 2, the quickest start reuses that measured config and runs fresh allocation probes:

```bash
bash ml/train_gpu.sh \
  --split-manifest /absolute/path/to/approved_split.json \
  --use-config runs/gpu-profile-001/selected-config.json \
  --run-dir runs/gpu-001 --epochs 20
```

Alternatively omit `--use-config` to tune and then train in one command. The profile window/cadence/target must match your approved data; use `--model-config YOUR_CONFIG.json` during profiling if the defaults do not. Tuning does not change architecture, target, window, learning rate or seed. It chooses microbatch/accumulation and CPU thread count.

### Performance with headroom

- Initial probe: microbatch 1. Sequential probes then test powers of two up to 128 by default, never exceeding the chosen effective batch. Each candidate executes full synthetic FP32 forward/backward/Adam updates in an isolated process. Failed probes are discarded; scaling stops on failure.
- Choose measured samples/second, not maximum VRAM occupancy. Selection requires peak Torch reserved memory ≤85% of the 4 GiB cap and free headroom ≥1.25 GiB. Candidates within 5% of the fastest are ranked by lower reserved memory and fewer CPU threads. Synthetic throughput includes transfers and optimization, but excludes real CSV preprocessing and checkpoint I/O; it is not a guarantee of full-run throughput.
- The actual trainer always enforces a **4 GiB reserved cap / 1 GiB free headroom**, checks memory before and after optimizer groups, and uses only one GPU job through this launcher's lock. Other applications and direct `train.py` invocations are outside that lock. Do not run them concurrently.
- The default **effective batch is 128**, an explicit optimization setting; it may change learning behavior compared with the earlier tiny-batch examples. Use `--effective-batch 16 --max-microbatch 16` during tuning if you want a smaller effective batch. The fastest hardware configuration is not automatically the most accurate model.
- CPU thread candidates are measured at 2, 4 and up to 8 threads, constrained by available CPUs. Data remains in CPU memory/memory-mapped files; only the current microbatch is pinned/transferred. Window indexes now use compact integer arrays. No whole-dataset GPU allocation or unbounded worker pool exists.
- Keep **2 GiB host RAM headroom** by default. Before parsing a pair, the launcher-enabled trainer conservatively budgets 12× the combined CSV file sizes plus that headroom. This estimate is a guard, not a proof of actual peak RAM. It also checks disk space and RAM at optimizer boundaries. Close RAM-heavy programs if this guard pauses the run; do not simply lower it on a loaded laptop.
- FP32 and deterministic operations remain enabled. Mixed precision is disabled because it has not been validated. Filling all VRAM, forcing all CPU cores busy or promising 100% GPU utilization would not establish higher throughput or crash safety.

### Resume and change strategy yourself

Normal resume (same manifest/config, optional larger total epoch count):

```bash
bash ml/train_gpu.sh --resume \
  --split-manifest /absolute/path/to/approved_split.json \
  --run-dir runs/gpu-001 --epochs 30
```

If an OOM occurred or free VRAM has decreased, first close other GPU programs. Then explicitly reduce the microbatch, for example from 128 to 64 (choose a value no larger than your actual selected microbatch):

```bash
bash ml/train_gpu.sh --resume --resume-microbatch 64 \
  --split-manifest /absolute/path/to/approved_split.json \
  --run-dir runs/gpu-001
```

The recovery value must divide the existing effective batch. Accumulation increases to preserve that effective batch; optimizer state, seed, data ordering and completed work are restored from the last atomic checkpoint. Fresh probes must pass before resuming. Floating-point grouping changes when microbatch changes, so recovery is not promised bitwise identical to an uninterrupted run with the old batch. Normal same-config deterministic resume is tested separately. Recovery cannot silently change learning rate, window, model, data, or target; those require a new experiment.

Checkpoints occur every **10 completed optimizer updates** and each epoch, with an initial checkpoint before optimization. A resource-pressure pause saves at a completed update boundary and exits **75**; free resources and resume. An OOM or driver/data error returns nonzero and preserves the last complete checkpoint; a potentially half-updated optimizer is never saved as success. There is no infinite automatic retry or silently skipped batch. If failure occurred before the initial checkpoint, fix the cause and choose a new run directory.

For direct training CLI recovery, the equivalent is `--resume-from-checkpoint ... --allow-rebatch` plus a saved config with smaller microbatch and compensating accumulation. Only an equal effective batch and smaller/equal microbatch are accepted. Preserve the original code/environment: changing trainer/parser code deliberately invalidates old checkpoint hashes.

### Files and practical troubleshooting

`hardware.json` records the host/driver/Python check. `smoke.raw.json`, `m*-t*.raw.json` and `tuning.json` retain candidate outcomes; `selected-config.json` is the effective experiment config. Training writes `console.log`, `model.run.jsonl`, `model.pt`, `launch-command.json` and `launch-status.json` in the run directory. A tune-only directory has no model checkpoint. Live progress:

```bash
tail -f runs/gpu-001/model.run.jsonl
# In another terminal, observe utilization/memory; this does not change GPU settings:
watch -n 1 nvidia-smi
```

| Problem | What to do locally |
| --- | --- |
| Driver works in terminal but not the agent | Run the supplied commands in the host terminal. This environment's sandbox hides GPU devices. |
| `CUDA unavailable` | Run `bash ml/setup_gpu.sh`; do not use the CPU-only `.local-tools/ml-venv` for GPU training. Set `NAVDR_PYTHON=/path/to/cuda/python` only if deliberately using another compatible environment. |
| Package download timeout | Rerun setup; use a stable network and enough disk space. The NVIDIA alternate mirror timed out here; setup uses PyPI instead. |
| Probe fails even at microbatch 1 | Read `smoke.raw.json`; check driver/Torch and close other GPU jobs. Do not treat failure as approval or repeatedly launch real training. |
| OOM during training | Stop competing GPU jobs, then resume with a smaller microbatch as shown above. Keep the 4/1 GPU budget. |
| Exit 75 / RAM or disk pause | Close RAM-heavy applications or free disk, then resume the same run. If no checkpoint exists yet, use a new run directory after fixing resources. |
| Another launcher holds the lock | Wait for that run or stop it deliberately. Do not delete a lock file to bypass an active process. |
| NaN loss / bad data / manifest error | Read the precise error. Fix and review data/config; start a new experiment for changed manifests/learning rate/target. No automatic skipping occurs. |
| Slow preprocessing but low GPU use | CSV decoding/alignment is CPU work. During training, compare measured candidate throughput; a tiny model may not saturate every GPU component. |
| Unstable laptop behavior | Use AC power and keep cooling unobstructed. The scripts do not change thermal/power limits; stop if the system is unhealthy. No software can guarantee against driver/power/thermal faults. |

Evaluation after training is still the command in section 5; use the CPU environment and the same approved manifest. All approval and real-data interpretation boundaries remain unchanged.

## 1. Run the self-test now

All commands below start at the repository root. The existing isolated Python is already installed on this machine:

```bash
cd /home/rimuru/Downloads/Antigravity/SIH_Pototype
.local-tools/ml-venv/bin/python ml/train.py --self-test --output-dir runs/self-test-001
```

Choose a **new output directory** on each invocation. The self-test generates its own three tiny, explicitly synthetic phone/vehicle pairs, a `SYNTHETIC_SELF_TEST` manifest and two outages per trip. It opens no real IO-VNBD files; an audit hook rejects attempts to open anything under `IO-VNBD-master`. Its manifest is fixture metadata, not a human approval or a real dataset split. The ordinary training/evaluation CLI refuses synthetic manifests.

This single command:

1. Parses elapsed milliseconds plus calendar text for the phone, and seconds since midnight for the vehicle, using the same adapter used for real experiments. A deliberate one-hour wall-clock difference is resolved by explicit fixture UTC offsets.
2. Tests rejection of missing files/manifests, unapproved/raw-inventory schemas, cross-split groups and duplicate hashes, changed payloads and wrong cadence/clock mappings.
3. Validates weighted gradient accumulation against a full batch, including an uneven final microbatch.
4. Trains two CPU epochs, checkpointing during the epoch. It pauses another run after three updates and resumes it; final weights and epoch losses must match uninterrupted training exactly.
5. Checks train-only normalization and that training never opens test CSVs.
6. Evaluates the held-out fixture with learned speed + gyro, raw integration, last-speed + gyro, and the **actual Kotlin NavigationEngine**.
7. Checks two separate 100 m outages with 15 m error report **15% each**, runs the existing browser outage acceptance too, and checks missing reference/output remains null.

Success ends with `"status": "PASS"`. Inspect `acceptance.json`, `evaluation/report.md` and `evaluation/report.json`. The numbers are synthetic correctness results, not real accuracy or proof that learning outperforms the baselines. GPU training and mixed precision are not validated by this CPU test.

### Environment prerequisites and recovery

Tested CPU environment: Python 3.12.11, Torch 2.10.0+cpu, NumPy 2.2.6. `requirements.lock` pins the complete environment, including the earlier runtime-conversion tools. Java and Node are also required for the Kotlin comparator and browser scoring acceptance.

If the existing Python environment is missing, install `uv`, then recreate it:

```bash
uv venv --python 3.12.11 .local-tools/ml-venv
uv pip sync --python .local-tools/ml-venv/bin/python ml/requirements.lock --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match
```

The Kotlin runner already exists here at `native/android/navigation/build/install/navigation/bin/navigation`. If absent or if you intentionally change native code, use the project's JDK 17/Android SDK build setup and run:

```bash
cd native/android
./gradlew :navigation:installDist
cd ../..
```

Gradle may need initial dependency downloads and the Android SDK configuration because the enclosing project includes the app. The evaluator records the actual runner/JAR hashes; it does not silently rebuild or substitute a Python EKF. To evaluate using another built distribution, pass `--kotlin-runner /absolute/path/to/navigation`. Real evaluation requires Java but not Node; Node is required by the self-test.

## 2. Supply your approved manifest

The supported input is **whole raw phone/vehicle CSV pairs**, with one entry per trip and exactly one split per entry. Row ranges are intentionally unsupported: make any necessary, reviewed trip segments into separate files and keep all overlapping/related segments in one `recording_group`. No CSV directory scanning or automatic split selection occurs. Paths resolve relative to the manifest, or can be absolute.

Use schema `navdr.approved-raw-split.v1`, boolean `synthetic: false`, status `APPROVED`, a named reviewer/date and all five explicit review attestations. These attestations record your decision; the software cannot verify that a human actually reviewed the files. Keep that responsibility separate from automatic validation.

Below is the complete structure for **one illustrative entry**. It is documentation, not a created manifest, and its column spellings, timing, mount and paths are not approvals for your files. Replace every `REPLACE_...` value, verify every numeric assumption, and include your actual train, dev and test trip entries in the `trips` array. Do not copy the same recording into different splits.

```json
{
  "schema": "navdr.approved-raw-split.v1",
  "synthetic": false,
  "status": "APPROVED",
  "review": {
    "reviewer": "REPLACE_WITH_YOUR_NAME",
    "reviewed_at": "REPLACE_WITH_REVIEW_DATE",
    "pairings": true,
    "clocks": true,
    "units_axes_gravity": true,
    "duplicates_and_overlap": true,
    "split": true
  },
  "trips": [
    {
      "id": "REPLACE_WITH_UNIQUE_TRIP_ID",
      "split": "train",
      "recording_group": "REPLACE_WITH_ORIGINAL_RECORDING_GROUP",
      "vehicle_id": "REPLACE_WITH_VEHICLE_ID",
      "phone_id": "REPLACE_WITH_PHONE_ID",
      "route_id": "REPLACE_WITH_ROUTE_ID",
      "phone": {
        "path": "REPLACE_WITH_PHONE_CSV_PATH",
        "sha256": "REPLACE_WITH_64_CHARACTER_LOWERCASE_SHA256",
        "encoding": "utf-8",
        "columns": {
          "ax": {"column": "REPLACE_WITH_ACCEL_X_HEADER", "scale": 1.0},
          "ay": {"column": "REPLACE_WITH_ACCEL_Y_HEADER", "scale": 1.0},
          "az": {"column": "REPLACE_WITH_ACCEL_Z_HEADER", "scale": 1.0},
          "gx": {"column": "REPLACE_WITH_GYRO_X_HEADER", "scale": 1.0},
          "gy": {"column": "REPLACE_WITH_GYRO_Y_HEADER", "scale": 1.0},
          "gz": {"column": "REPLACE_WITH_GYRO_Z_HEADER", "scale": 1.0},
          "lat": {"column": "REPLACE_WITH_PHONE_LATITUDE_HEADER", "scale": 1.0},
          "lon": {"column": "REPLACE_WITH_PHONE_LONGITUDE_HEADER", "scale": 1.0},
          "speed": {"column": "REPLACE_WITH_PHONE_SPEED_HEADER", "scale": 0.2777777777777778},
          "bearing": {"column": "REPLACE_WITH_PHONE_BEARING_HEADER", "scale": 1.0},
          "accuracy": {"column": "REPLACE_WITH_PHONE_ACCURACY_HEADER", "scale": 1.0}
        }
      },
      "vehicle": {
        "path": "REPLACE_WITH_VEHICLE_CSV_PATH",
        "sha256": "REPLACE_WITH_64_CHARACTER_LOWERCASE_SHA256",
        "encoding": "utf-8",
        "columns": {
          "speed": {"column": "REPLACE_WITH_REFERENCE_SPEED_HEADER", "scale": 0.2777777777777778},
          "lat": {"column": "REPLACE_WITH_REFERENCE_LATITUDE_HEADER", "scale": 1.0},
          "lon": {"column": "REPLACE_WITH_REFERENCE_LONGITUDE_HEADER", "scale": 1.0}
        }
      },
      "clock": {
        "phone_elapsed_column": "TIME SINCE START (ms)",
        "phone_calendar_column": "DATE (YYYY-MO-DD HH-MI-SS_SSS)",
        "phone_calendar_format": "%Y-%m-%d %H:%M:%S:%f",
        "phone_utc_offset_seconds": 0,
        "vehicle_seconds_column": "Time Since Start of Day (seconds)",
        "vehicle_date": "REPLACE_WITH_YYYY-MM-DD",
        "vehicle_utc_offset_seconds": 0,
        "vehicle_alignment_offset_seconds": 0,
        "calendar_tolerance_seconds": 0.01,
        "max_reference_gap_seconds": 0.2,
        "vehicle_midnight_policy": "reject"
      },
      "phone_gnss_time_policy": "row_time_reviewed_assumption",
      "gnss_time_rationale": "REPLACE_WITH_YOUR_REVIEW_OF_GNSS_FIX_FRESHNESS",
      "mount": {
        "up": [0, 0, 1],
        "forward": [0, 1, 0],
        "acceleration_includes_gravity": true
      },
      "outages": [[25.0, 29.0], [32.0, 36.0]]
    }
  ]
}
```

Calculate hashes of your chosen files yourself, for example:

```bash
sha256sum '/absolute/path/to/reviewed-phone.csv' '/absolute/path/to/reviewed-vehicle.csv'
```

### Exact contract and validation rules

- **Grouping:** all trips sharing any non-null vehicle, phone, route or recording-group identifier must stay in one split. Declared identical file hashes and identical resolved paths also cannot cross splits. Assign categorized/uncategorized aliases and overlapping synchronized/unsynchronized derivatives the same recording group. Different hashes do not prove independence. Deduplicate repeated copies where appropriate before your approval. If a vehicle/phone/route identity is unknown, explicitly use JSON `null` and add a nonempty `unknown_group_rationale` to that trip; the report cannot guarantee separation along unknown identities. `recording_group` is always required. If these rules leave fewer than three independent groups, this protocol cannot provide a three-way independent split; it refuses instead of window-splitting to manufacture one.
- **Split access:** training validates all manifest entries and file existence, but reads/hashes/parses CSV contents only for train and dev. Test CSV content is first hash-verified and parsed when evaluating test. Dev is read only for validation loss, never optimization or normalization. Evaluation reads only its selected split. A malformed manifest or missing referenced file fails before training. Selected file content/header/timestamp errors fail when parsed. No unlisted file is discovered as data.
- **Units:** `scale` multiplies the raw column. Output acceleration must be m/s² **including gravity**, gyro rad/s, speed m/s, geographic coordinates degrees, bearing clockwise from north in degrees, accuracy meters. Use `1/3.6` for a genuinely km/h column, `π/180` for a genuinely deg/s gyro. Negative scale can explicitly reverse an axis. Map gyro yaw/pitch/roll labels to actual x/y/z based on documentation/inspection; names alone do not prove axis correspondence. Arbitrary rotation matrices, gravity reconstruction, rolling mount changes, automatic calibration and additive sensor offsets are not implemented. If your reviewed files require them, perform a documented conversion first, hash the resulting CSVs and approve their mappings; do not claim the raw data satisfies this contract.
- **Mount:** up and forward are expressed in the mapped IMU coordinate system. Up is normalized, forward is projected perpendicular to up and normalized. Longitudinal acceleration is `(a - 9.80665*up) dot forward`; geographic yaw rate is `-gyro dot up`. These match the native engine. Raw columns remain the model's six channels. Fixed mount and forward-only motion are assumptions, not automatic alignment.
- **Encoding/headers:** use the exact decoded header names, including trailing spaces. `csv.DictReader` uses `skipinitialspace=True`, so leading delimiter spaces are skipped. `encoding` must explicitly match the file; decoding errors are fatal. Some original IO-VNBD headers had mixed byte encodings. You can deliberately use a reversible single-byte decoding such as `latin-1` and copy its exact decoded names, or prepare documented normalized copies. The training parser never silently replaces undecodable bytes or guesses that `\\xb2` text means a physical unit.
- **Phone clock:** calendar strings are parsed with your explicit format; UTC time = first calendar label minus `phone_utc_offset_seconds` plus elapsed-ms differences. Every calendar row must agree with this elapsed timeline within `calendar_tolerance_seconds`. `%f` accepts fractional seconds. No daylight-saving inference is made; segment transitions before approval if necessary.
- **Vehicle clock:** UTC time = midnight of `vehicle_date` + seconds-since-midnight − `vehicle_utc_offset_seconds` + `vehicle_alignment_offset_seconds`. A positive alignment offset moves vehicle samples later on the phone timeline. Date/offsets must be reviewed, not guessed from the apparent one-hour label difference. `reject` refuses backward clock changes. `unwrap` permits a midnight wrap only from after 23:00 to before 01:00; other resets and all repeated times fail.
- **Cadence/alignment:** phone elapsed time must strictly increase and each step must be within ±10% of `period_seconds`. No resampling or gap repair is hidden in training. Offline vehicle speed/reference interpolation is linear and only inside covered times, with consecutive reference spacing ≤`max_reference_gap_seconds`; exact reference timestamps remain usable across adjacent gaps. Extrapolation is forbidden. Windows with an unavailable target label are excluded and counts are logged; no usable windows is an error. A misalignment with partial overlap cannot be automatically detected, so approval remains necessary. Most previously inspected prefixes were near 10 Hz; that is evidence to review, not a universal cadence setting.
- **GNSS freshness:** the CSV schema lacks independently timestamped fresh fixes. This adapter supports only explicit `row_time_reviewed_assumption`, which treats a valid phone GPS row as a fix at that row's time. You must explain why that is acceptable in `gnss_time_rationale`. Repeated/stale GPS values can bias the comparison; this policy is disclosed in reports and is not physical phone GNSS delivery validation. If this assumption is unacceptable, do not approve these files for this adapter. Vehicle reference is never substituted for missing phone GNSS.
- **Reference:** vehicle speed is mandatory for training/evaluation. Vehicle latitude and longitude are optional together; when absent or blank, affected outage drift is null. No reference trajectory is invented by integrating the target speed. Phone GPS fields may be blank/null; such fixes are unavailable. Invalid/nonfinite IMU and speed values fail loudly. Position error uses a local tangent plane about a phone GPS origin; this is intended for local driving, not global geodesic navigation. The identity/quality of the reference remains your responsibility.
- **Outages:** each `[start,end]` is in seconds relative to the first phone row. Masked samples satisfy `start < t <= end`; the interval owns the previous-to-current motion segment. Ordered, disjoint intervals must lie inside the recording. Provide `[]` if there are none; then no outage evidence can be reported. Use starts after the model warm-up and enough GNSS initialization. Drift is scored only with complete reference/output, duration ≥3 seconds and reference distance >5 m, matching browser eligibility.

## 3. Train on CPU after approval

Create the approved manifest yourself using the contract above. These commands do not generate it:

```bash
.local-tools/ml-venv/bin/python ml/train.py \
  --split-manifest /absolute/path/to/approved_split.json \
  --model-config ml/configs/training-v2.json \
  --learning-rate 0.001 --epochs 20 --microbatch 1 --accumulation 4 \
  --window-size 231 --period-seconds 0.1 --seed 26168 \
  --checkpoint-every-updates 100 \
  --checkpoint runs/experiment-001/model.pt
```

CPU is the default. `--batch-size` aliases `--microbatch`; `--window` aliases `--window-size`. Effective optimizer batch is microbatch × accumulation, except for the final smaller group. The tested accumulation divides each microbatch's summed loss by the actual number of samples in that optimizer group. FP32 only; there is no AMP flag because mixed precision has not been validated.

Config defaults are in `ml/configs/training-v2.json`; command-line overrides take priority. `period_seconds`, window, target scale and all review assumptions must suit your selected data. At 10 Hz, a 231-sample window spans 23 seconds from first to last sample; predictions start at index 230. The first 230 rows are warm-up, excluded from model velocity scoring. The TCN output is tanh-normalized speed, scaled by `target_scale_mps` (default 60). Training refuses negative or larger labels; this target contract is forward-driving scalar speed, not unrestricted 2D velocity. Window ≤1000 and microbatch ≤256 are explicit scaffold limits; CUDA configurations always require allocation probes. No automatic hyperparameter search occurs.

Loss is mean squared **normalized** speed error. Reported dev loss uses frozen training normalization and no optimizer updates. Normalization uses every training sensor row once before overlapping windows, never dev/test rows. Checkpoint selection/tuning should use dev only. The code saves the latest model, not an automatically selected “best” checkpoint; copy a checkpoint under a distinct filename before continuing if you want to retain it. Preserve its run directory/config/log. Do not repeatedly tune against test results.

### Resume interrupted or extend a run

```bash
.local-tools/ml-venv/bin/python ml/train.py \
  --split-manifest /absolute/path/to/approved_split.json \
  --model-config runs/experiment-001/model.config.json \
  --epochs 30 \
  --checkpoint runs/experiment-001/model.pt \
  --resume-from-checkpoint runs/experiment-001/model.pt
```

Use the saved **effective config**, not just the original config before CLI overrides. Normally only total epochs may change. The explicit smaller-microbatch recovery described above is the sole additional exception. Epochs means total desired epochs, not additional epochs. Manifest bytes/hash, parsed source hashes, normalization, architecture/parser/trainer source hashes, Torch version, device and other config values must agree. Preserve these files/environment for reproducible resume. The next training permutation is deterministically generated from seed+epoch; optimizer state, row cursor, epoch loss totals, update count, history and CPU RNG state are restored.

Atomic `model.pt` replacement occurs every configured update interval and each epoch. A partial `.tmp` is not a checkpoint and can be discarded after a crash. Resume uses the last complete `model.pt`, repeating at most the work since that checkpoint. No partial gradients are saved: checkpoints occur only at optimizer boundaries. CPU self-test demonstrated bitwise-identical weights and epoch losses for mid-epoch resume. GPU resume/determinism is **untested** and no cross-hardware equality is promised. SIGKILL/power loss cannot write a last-minute checkpoint. For a deliberate pause, use `--max-updates 50`; this saves after 50 updates in that invocation and exits cleanly.

Run logs append on resume. If a crash happens between checkpoint publication and the next log line, checkpoint `history` is authoritative; a new `resume` event indicates continuation. Exceptions are logged as `failed` when the checkpoint directory exists, and return nonzero. Missing manifest/invalid CLI may fail before a run directory is created; stderr remains the error source.

## 4. GPU use and the 6 GB VRAM budget

CPU success is not a GPU memory pass. The earlier blocked probe ran in a sandbox that hides GPU devices; a subsequent direct host check confirmed the RTX 4050 and working driver. See the fast-start section above and the latest GPU acceptance evidence for current measured status. The pinned CPU environment intentionally has no CUDA Torch. No script changes drivers or launches cloud work.

Once you have a working NVIDIA driver (`nvidia-smi` succeeds), create a **separate** Python 3.12 CUDA environment. Select an official PyTorch CUDA wheel compatible with your actual driver, install the same Torch version and NumPy version where supported, and record the environment. Do not replace the CPU conversion lock in place. Wheel selection depends on your driver's capability; use the official selector at https://pytorch.org/get-started/locally/ and the release commands at https://pytorch.org/get-started/previous-versions/ . The core trainer requires Torch and NumPy only, not the converter packages. A shell recipe with an explicitly user-chosen wheel index is:

```bash
uv venv --python 3.12.11 .local-tools/ml-cuda
# Set this to the official CUDA index YOU selected for your working driver.
NAVDR_TORCH_INDEX='REPLACE_WITH_OFFICIAL_PYTORCH_CUDA_INDEX_URL'
uv pip install --python .local-tools/ml-cuda/bin/python --index-url "$NAVDR_TORCH_INDEX" 'torch==2.10.0'
uv pip install --python .local-tools/ml-cuda/bin/python 'numpy==2.2.6'
uv pip freeze --python .local-tools/ml-cuda/bin/python > ml/requirements.cuda.local.lock
```

Check the selected environment reports CUDA availability yourself. Start a fresh GPU experiment; the strict resume path does not move CPU optimizer checkpoints onto a different device.

```bash
.local-tools/ml-cuda/bin/python ml/train.py \
  --split-manifest /absolute/path/to/approved_split.json \
  --model-config ml/configs/training-v2.json \
  --device cuda --microbatch 1 --accumulation 4 \
  --reserved-gib 4 --headroom-gib 1 \
  --checkpoint runs/gpu-001/model.pt
```

Before allocating the actual training model on CUDA, the trainer launches `memory_probe.py` in an isolated subprocess. It checks driver/CUDA/free memory, then runs three complete synthetic forward/backward/Adam steps at microbatch 1. If you request a larger microbatch (up to 256), it probes that exact configuration **after** microbatch 1 passes. Both results are persisted. Failure/timeout stops the training process; there is no fallback success. Gradient accumulation increases effective batch without placing that full batch on the GPU.

The default budget is reserved Torch memory ≤4 GiB and at least 1 GiB observed/conservative free headroom. The actual training process also sets its allocator cap and checks budget/headroom after updates. Torch reserved memory excludes some driver/library allocations; the free-memory check adds protection but cannot guarantee no OOM if another process consumes memory. Run one GPU job at a time. Data stays on CPU; only each microbatch and the model/optimizer move to GPU.

For a different GPU, explicitly pass different positive `--reserved-gib` and `--headroom-gib`; both limits feed the isolated probe and the trainer. For your 6 GB card, retain 4/1 initially. Reducing window/microbatch or changing the model/config defines a new experiment and must be probed again. OOM can still occur; it is a failed run, not an accuracy result. To probe synthetic inputs without any real manifest:

```bash
.local-tools/ml-cuda/bin/python ml/memory_probe.py \
  --config ml/configs/toy-v1.json --reserved-gib 4 --headroom-gib 1
```

That command probes the **toy-v1 shape only**. It does not approve another training configuration. The automatic preflight creates and probes the actual requested training shape.

## 5. Evaluate the frozen experiment

Evaluation runs on CPU and defaults to the test split:

```bash
.local-tools/ml-venv/bin/python ml/evaluate.py \
  --split-manifest /absolute/path/to/approved_split.json \
  --checkpoint runs/experiment-001/model.pt \
  --output-dir runs/experiment-001/test-evaluation
```

For development evaluation, add `--split dev` and use a distinct output directory. Evaluation refuses to overwrite an existing report directory. It checks checkpoint/manifest and model/parser source identity. A raw inventory or synthetic fixture cannot be passed as a real approved manifest. Only load trusted PyTorch checkpoints.

All four methods use exactly the same selected trips, phone IMU/GNSS and outage mask. Only offline loss/scoring receives aligned vehicle reference:

| Method | Navigation behavior |
| --- | --- |
| `learned_speed_gyro` | TCN scalar speed, heading advanced with phone gyro, phone GNSS reanchors outside outages. This is a defined offline test policy, not Android ML fusion. |
| `raw_integration` | Integrates fixed-mount longitudinal acceleration into speed and gyro into heading; phone GNSS reanchors outside outages. |
| `last_speed_gyro` | Holds the last usable phone-GNSS speed while heading follows the same gyro; phone GNSS reanchors outside outages. |
| `classical_ekf` | Executes the actual six-state Kotlin NavigationEngine without learned corrections, with its existing GNSS acceptance/gating and availability policies. |

Simple navigation speeds are clipped to [0,60] m/s to match the classical bound; raw model velocity errors are evaluated before clipping. All integrations are explicitly discrete approximations; raw/learned/last-speed use current-step speed/heading, while the native filter retains its own predictor. No heading is taken from vehicle truth. Estimator-only TSV files make the Kotlin input auditable: they contain phone sensor/fix inputs, never reference labels/positions.

### Reading the report

- **Velocity MAE** is mean absolute speed error in m/s; **RMSE** penalizes larger errors more strongly. Lower is better. The main table uses the intersection of timestamps with target/model/all-baseline outputs, so methods are compared on the same rows. JSON also includes per-method available counts. Zero common rows means unavailable metrics, not perfect performance; inspect initialization, warm-up and baseline availability.
- **Each outage has its own denominator:** `100 * peak position error / reference distance within that outage`. There is deliberately no pooled drift percentage. Two 100 m outages with 15 m peak error each must show 15% and 15%, never 7.5%.
- `INCOMPLETE REFERENCE`, `INCOMPLETE OUTPUT` or `INSUFFICIENT DATA` produces null drift. The Markdown shows “unavailable.” In trajectory CSVs missing numbers are blank. No field silently converts missing evidence to zero error.
- The eligibility rules/formula match `js/navigation-core.js`'s corrected scorer. The geographic distance implementation differs explicitly: this evaluator uses local-plane meters, the browser uses its geographic distance helper. Long-distance/projection effects are not validated by the toy test.
- The native engine invalidates on IMU gaps >100 ms and outages >30 s. Lower-rate files or longer outages may leave EKF results unavailable. This limitation is reported, not patched away to improve its score. A 10 Hz recording with jitter above 100 ms can trigger native gaps even if it passed the adapter's ±10% cadence tolerance. Review coverage rather than silently excluding those cases.
- Synthetic scores only prove execution and numerical plumbing. Real results still depend on correct alignment, reference quality, mount assumptions and independent splitting. No “highest accuracy” promise, SIH scoring interpretation, or production runtime selection is implied.

## 6. What completed runs produce

For `--checkpoint runs/experiment-001/model.pt`:

| Artifact | Purpose |
| --- | --- |
| `model.pt` | Latest complete weights, Adam state, effective config/hash, manifest hash, source hashes, normalization, RNG/cursor/history and progress. |
| `model.config.json` | Effective config including CLI overrides; use this for resume. |
| `model.run.jsonl` | Durable start/resume events, versions/hashes/seed, parsed trip counts, each epoch's train/dev loss, completion or failure. |
| `model.prepared/*.npy` | CPU cache of train/dev sensor/label arrays. Rebuilt and revalidated on resume; can be removed after training. |
| `probe-config-m*.json`, `probe-m*.log` | CUDA-only exact probe shapes and raw results. |

For an evaluation directory: `report.md` is the readable summary; `report.json` contains hashes, counts, metrics and independent outage results. Each `trip-*/predictions.csv` contains all method trajectories/speeds plus reference; `estimator-only.tsv`, `kotlin-output.csv` and `kotlin.log` show the actual classical comparator execution. Predicted positions are north/east meters relative to the recorded phone-origin coordinate system, not a plotted global map.

“Done” means a `completed` event in the run log, the requested total epochs recorded in the checkpoint, and an evaluation report whose coverage and unscored intervals you have inspected. Merely having a checkpoint (including a paused run) does not mean all requested epochs completed. Evaluation can inspect a partial checkpoint and reports its completed epoch count; that is not automatic model acceptance.

## 7. Troubleshooting without another agent session

| Symptom | Action |
| --- | --- |
| Missing/malformed/unapproved manifest | Read the exact stderr field. Use the schema above, actual train/dev/test entries, explicit review attestations and valid JSON. Do not use the raw inventory or a fixture as approval. |
| Missing file or changed payload | Resolve paths relative to the manifest, verify the file exists and recompute SHA256. If content changed, review it and create a new approved manifest/experiment; resume must reject a different manifest. |
| Duplicate/group leakage | Keep every alias/overlapping recording and shared known vehicle/phone/route together. If independent groups are insufficient, do not fabricate a split. |
| UnicodeDecodeError / missing column | Inspect the file's actual encoding and decoded headers, including spaces. Declare encoding explicitly or create reviewed normalized copies. Do not delete unit characters blindly. |
| Clock reset, calendar mismatch or cadence error | Inspect raw times. Correct reviewed date/timezone/alignment settings; document actual resets/gaps and segment/clean source files before re-approval. The parser intentionally refuses automatic repair. |
| No aligned labels/windows | Check overlap, offset sign, reference gap limit, cadence and window length. A 231-sample model needs at least 231 rows. Wrong clocks can produce zero overlap. |
| OOM / failed GPU probe | Stop other GPU jobs, retain microbatch 1, increase accumulation instead of microbatch, or start a new smaller-window config. Do not raise budgets merely to bypass failure. The last complete checkpoint remains resumable with the same config once resources are available. |
| NVIDIA driver unavailable / CPU-only Torch | CPU training remains usable. Fix host driver yourself and create the separate CUDA environment; no driver installation is automated. |
| Deterministic CUDA operation error | Keep the error; CUDA path is untested here. CPU has the validated deterministic path. Do not silently disable determinism while claiming exact resume. |
| Resume config/hash mismatch | Use the original manifest bytes, saved effective config and code/environment. Only epochs may change. Start a distinct experiment for other changes. |
| All position scores unavailable | Check reference lat/lon, early GNSS moving-course initialization, model warm-up, ≥3 s and >5 m eligibility, >100 ms native gaps and >30 s native outage limit. Null is not zero accuracy. |
| Kotlin runner/Java missing | Build `:navigation:installDist`, configure Java, and use the correct runner path. No Python approximation is substituted. |
| Output already exists | Resume a training checkpoint explicitly, or choose a new experiment/evaluation/self-test directory. Preserve prior evidence. |
| Host RAM/disk pressure | Parsing holds one phone/vehicle trip and its aligned arrays in CPU RAM. Training uses memory-mapped arrays with at most two open cache entries, but the window index grows with rows. This has not been profiled on the full real corpus. Preserve grouping if you prepare smaller reviewed trip segments; allow disk space for CPU caches/checkpoints. |

## Prior operator-compatibility evidence

The earlier random-weight experiment used the same TCN topology and matched its JS output, then converted/executed both ONNX and LiteRT on desktop CPU. That evidence is separate from training accuracy, GPU validation, Android runtime loading, latency, memory and battery. Run it with `.local-tools/ml-venv/bin/python ml/compare_runtimes.py --output /path/to/new-runtime-output` if needed. No shipping runtime has been selected. Mixed precision, quantization, mobile learned-model inference and real-data accuracy remain untested by this standalone self-test.
