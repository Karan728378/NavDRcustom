# IO-VNBD: ready for your data review

16 September 2026. Actual CSV retrieval and the R07 inventory are complete. No trustworthy pairing has been selected, no real train/dev/test split exists, and no real-data training or accuracy evaluation has run. The next step is your review of the raw phone/vehicle files and preprocessing assumptions.

## What was built and executed

The [inventory scanner](/home/rimuru/Downloads/Antigravity/SIH_Pototype/tools/inventory_io_vnbd.py:54) detects missing Git LFS payloads, hashes actual CSVs, lists duplicate payloads and proposes filename-only pairing candidates. Its [CSV probe](/home/rimuru/Downloads/Antigravity/SIH_Pototype/tools/inventory_io_vnbd.py:16) reports header-declared units/axes, first-row clocks and timestamp statistics from at most 4,096 rows per file. Physical axis mappings and measured phone/vehicle clock offsets remain unset.

The [CSV downloader](/home/rimuru/Downloads/Antigravity/SIH_Pototype/tools/fetch_io_vnbd_lfs.py:22) retrieved publicly referenced objects and checked their size and SHA-256 before replacing matching local pointers. The [download report](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/io-vnbd-inventory/download-report.json:1) records 329 unique verified objects totaling 1,063,518,407 bytes. All 564 CSV paths now contain actual data. The 161 images and two ZIP archives remain pointers; they were not part of this CSV retrieval.

The exact download/inventory commands and initial pointer evidence are in the [evidence README](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/io-vnbd-inventory/README.md:1). Post-download acceptance independently compared every final CSV hash against its original pointer and checked that every prefix probe ran. Selected fields from the actual [verification output](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/io-vnbd-inventory/payload-verification.json:1):

```json
{
  "status": "PASS_POINTER_REPLACEMENT_AND_HASH_VERIFICATION",
  "csvPathsChecked": 564,
  "allPayloadHashesMatchPointers": true,
  "uniqueCsvPayloads": 329,
  "probeStatuses": {"csv_prefix_inspected": 564},
  "pairingsApproved": 0,
  "splitCreated": false,
  "trainingRun": false
}
```

This pass establishes file integrity and executed prefix inspection. Full-trip data quality, physical calibration, alignment and navigation accuracy are **untested**.

## What needs attention

The [raw inventory](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/io-vnbd-inventory/inventory-payloads.json:1) contains every file's headers, statistics, hashes, candidate pairings and duplicate groups. Its [summary](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/io-vnbd-inventory/inventory-payloads-summary.json:1) reports:

| Observation | Meaning for review |
| --- | --- |
| 564 CSV paths, 329 unique payloads | File count is not a count of independent trips. |
| 230 duplicate-payload groups | Identical copies must be removed or kept in the same split group. Hash equality alone cannot detect overlapping but differently processed recordings. |
| 144 filename candidate pairing groups, zero approved | Matching names are clues; verify actual phone/vehicle correspondence. These groups can include aliases. |
| 548 prefix clock measurements near 10 Hz | The toy config's 100 Hz setting cannot simply be reused. Prefix cadence is not a full-trip guarantee. |
| 27 file/clock entries with non-increasing timestamps | Repeated or decreasing times need inspection. The count includes duplicate file copies, not 27 independent bad trips. |
| 241 files with escaped bytes in headers | The scanner preserved undecodable bytes, including a squared-unit character. Review encoding and unit mappings explicitly. |

The [verification details](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/io-vnbd-inventory/payload-verification.json:10) also report prefix cadence values around 2, 83.333, 1,000, 10.101 and 10.204 Hz. One CSV has no derived cadence. These are calculations from positive timestamp differences and explicit header units, not proof of valid sampling rates. Non-increasing times can coexist with those calculations. No suspect file was silently repaired, dropped or approved.

## A concrete first sample to hand-check

Open the synchronized S1 files: [phone S-S1.csv](</home/rimuru/Downloads/Antigravity/SIH_Pototype/IO-VNBD-master/Synchronised V abd S datasets/Categorised IOVNB Dataset/S (Driver A)/S1/S-S1.csv:1>) and [vehicle V-S1.csv](</home/rimuru/Downloads/Antigravity/SIH_Pototype/IO-VNBD-master/Synchronised V abd S datasets/Categorised IOVNB Dataset/S (Driver A)/S1/V-S1.csv:1>). This is an illustrative review sample, not an approved training pair.

The actual [prefix report](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/io-vnbd-inventory/first-pair-prefix.json:1) shows phone elapsed time in milliseconds, gyroscope labels in rad/s and GPS speed in Kmh; vehicle time is seconds since the start of day and velocity is labeled km/hr. These remain header declarations. Confirm what the phone's accelerometer/gravity and yaw/pitch/roll columns physically mean before converting them to canonical model channels.

The phone's first calendar label is `2019-09-08 10:07:49:546`; the vehicle's first time-of-day value is `32869.0` seconds (09:07:49). The roughly one-hour label difference is **not a measured synchronization offset**. Clock conventions and matching motion need review before choosing an alignment. Both inspected prefixes have roughly 100 ms positive time steps, but this does not establish that every row is correctly paired.

## How to proceed

1. Hand-check candidate pairs and record accepted/rejected/deferred decisions, clock conventions, label source, units, axes and gravity handling. Inspect whole trips for resets/gaps before declaring them usable. Supply known vehicle, phone and route identities; do not invent unknown metadata.
2. After those decisions, implement the agreed raw-to-canonical conversion and prepare a draft whole-trip split for your review. Account for duplicate and overlapping recordings, then inspect the actual trip/group manifest before finalizing it. The raw R07 inventory is not a ready-to-train manifest.
3. Resolve the GPU environment and run the isolated synthetic memory probe with the intended configuration. The [last recorded probe](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/README.md:49) was blocked by unavailable NVIDIA driver communication; the tested ML environment has CPU-only Torch. The 4 GiB reserved / 1 GiB headroom budget on your 6 GB GPU remains **unverified**. This retrieval used no GPU training.
4. Once pairings, preprocessing and the split are approved and memory is measured, you run the real experiments using the [ML guide](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/README.md:21). Keep the test set reserved until experiment choices are fixed. Model velocity error and end-to-end navigation drift are separate evaluations; this inventory establishes neither.

**STOP observed:** no pairing decision, canonical real-data preprocessing, split creation or real training followed the inventory. This follows your explicit instruction to hand-check files before committing to a split and to run/interpret real training yourself. Download completion was not treated as approval to cross those boundaries.
