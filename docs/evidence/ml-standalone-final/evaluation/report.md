# NavDR evaluation

**Synthetic fixture test — not real-world accuracy.**

Split: test. Trips: 1. Checkpoint completed epochs: 2.

Lower velocity MAE/RMSE is better. The table uses exactly the same available timestamps for all methods. Inspect coverage before comparing.

| Method | Common samples | MAE (m/s) | RMSE (m/s) |
| --- | ---: | ---: | ---: |
| learned_speed_gyro | 171 | 0.554660 | 0.563378 |
| raw_integration | 171 | 0.004795 | 0.008046 |
| last_speed_gyro | 171 | 0.019181 | 0.032184 |
| classical_ekf | 171 | 0.002498 | 0.003335 |

## Each outage separately

Drift = 100 × peak position error / reference distance within that outage. Unavailable means it cannot be scored; it does not mean zero error.

| Trip | Method | Outage | Distance (m) | Peak error (m) | Drift (%) | Status |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| synthetic-test | learned_speed_gyro | 1 | 23.364000 | 1.862518 | 7.971743 | SCORED |
| synthetic-test | learned_speed_gyro | 2 | 23.924000 | 2.422481 | 10.125734 | SCORED |
| synthetic-test | raw_integration | 1 | 23.364000 | 0.040998 | 0.175476 | SCORED |
| synthetic-test | raw_integration | 2 | 23.924000 | 0.040998 | 0.171368 | SCORED |
| synthetic-test | last_speed_gyro | 1 | 23.364000 | 0.163993 | 0.701903 | SCORED |
| synthetic-test | last_speed_gyro | 2 | 23.924000 | 0.163993 | 0.685473 | SCORED |
| synthetic-test | classical_ekf | 1 | 23.364000 | 0.028351 | 0.121344 | SCORED |
| synthetic-test | classical_ekf | 2 | 23.924000 | 0.028059 | 0.117284 | SCORED |

## Interpretation and limits

- SYNTHETIC CORRECTNESS ONLY; no real accuracy conclusion.
- Scalar TCN speed plus phone-gyro heading; not a learned position/heading model or a deployed fusion policy.
- Phone GNSS row timestamps are a reviewer-approved assumption, not verified fix ages.
- All methods receive the same phone inputs and outage mask; vehicle reference is evaluation/label only.
- Velocity common metrics use the intersection of available windows across all methods; per-method coverage is also shown.
- Per-outage drift is not pooled. Missing truth/output yields null, never zero.
- Browser scoring formula/eligibility matched; this adapter uses local tangent-plane distances.
- Kotlin engine retains its >100 ms gap and 30 s outage limits; unavailable output is explicitly unscored.
- No automatic clock alignment, gap repair, axis inference, or duplicate selection was performed.

`report.json` includes per-method available counts and each trip/outage. `trip-*/predictions.csv` contains aligned outputs for inspection. No test-based tuning or production decision is made by this tool.
