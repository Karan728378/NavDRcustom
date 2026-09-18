# IO-VNBD inventory evidence

## Current result: CSV payloads retrieved; human review pending

All 564 CSV paths now contain actual payloads. `download-report.json` records 329 verified unique objects totaling 1,063,518,407 bytes. `payload-verification.json` records the independent comparison of all 564 final file hashes against the original pointers. The CSV-prefix inspection path executed on all 564 files, with a maximum of 4,096 rows per file. This does not certify full-trip quality, clock alignment or training suitability.

Commands executed after the initial inventory:

```sh
python3 tools/fetch_io_vnbd_lfs.py docs/evidence/io-vnbd-inventory/inventory.json IO-VNBD-master --report docs/evidence/io-vnbd-inventory/download-report.json > docs/evidence/io-vnbd-inventory/download.log 2>&1
python3 tools/inventory_io_vnbd.py IO-VNBD-master --output docs/evidence/io-vnbd-inventory/inventory-payloads.json
```

`inventory-payloads.json` is the full current raw inventory; `inventory-payloads-summary.json` contains its summary. There are 230 groups of duplicate CSV payloads and 144 filename candidate pairing groups, with zero approved pairings. ZIP/image pointers remain; no CSV pointers remain. No split or training was run. See [the review handoff](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/IO_VNBD_REVIEW.md:1).

## Historical initial scan: before CSV retrieval

The following results describe the folder before downloading actual CSV contents. They are retained as evidence of the initial state, not the current state.

Command executed from the project root:

```sh
python3 tools/inventory_io_vnbd.py IO-VNBD-master --output docs/evidence/io-vnbd-inventory/inventory.json
```

`run.log` is the actual initial console output. `inventory.json` lists every file, the LFS pointer contents/object identifiers/sizes, and filename-only candidate groups. All 564 CSV files were LFS pointers. Zero sensor CSV payloads were present. The two ZIP archives and 161 images were also pointers. The README and PDF existed locally, but they were not sensor measurements.

The inventory's 144 filename groups are unreviewed candidates, not approved pairings or a count of independent trips. Categorized and uncategorized copies can refer to the same object. No phone/vehicle clock offset, axis mapping, measured cadence or training split was inferred. Units/cadence/timestamp fields are explicitly unavailable for pointers.

The scanner's pointer-detection path ran on the supplied folder. Assertions confirmed 564/564 CSV pointers, zero payloads, null measurement cadence/clock offsets and zero approved pairings. At that stage its numerical CSV-prefix inspection path was **untested on actual IO-VNBD measurements**, because none was present. That path has since run as described above. A syntax compilation is not a data-quality acceptance test.

Initial STOP: obtain actual LFS contents, rerun inventory to a new output file, then let the user hand-check actual files and approve pairings before any split/training. Retrieval and the new inventory are now complete. The human pairing/split review boundary still applies.

GitHub documents that an LFS pointer stores an object identifier and expected size in place of the actual large file: [GitHub LFS documentation](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage).
