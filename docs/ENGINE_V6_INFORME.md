# PerData Engine v6 with TimesFM: calibration report

The saved backtest covers 61 assets and rolling cuts six months apart. P50 MAPE is lower-is-better. We selected the P50 weights on one half of the assets and scored the other half, then reversed the halves. K80 was fitted on each training half and checked on the opposite half. The prediction band blends the relative Chronos-2 and TimesFM quantile spreads using their relative P50 weights, centered on the new P50. If both model weights are zero, it uses the Chronos-2 spread.

| Horizon (months) | Chronos-2 a | v3 b | TimesFM c | v5 MAPE | v6 MAPE OOS | No-change MAPE | K80 | Coverage OOS |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.05 | 0.10 | 0.00 | 5.50 | 5.41 | 5.37 | 0.94 | 79.1% |
| 3 | 0.00 | 0.00 | 0.10 | 11.40 | 10.92 | 10.77 | 1.17 | 81.7% |
| 6 | 0.00 | 0.00 | 0.25 | 17.10 | 15.73 | 15.81 | 1.39 | 79.6% |
| 12 | 0.10 | 0.05 | 0.40 | 21.75 | 20.81 | 20.92 | 1.50 | 79.7% |
| 24 | 0.10 | 0.00 | 0.60 | 28.88 | 28.22 | 28.30 | 1.74 | 80.4% |
| 36 | 0.35 | 0.00 | 0.45 | 31.45 | 31.72 | 31.56 | 1.58 | 79.2% |
| 48 | 0.00 | 0.05 | 0.60 | 34.55 | 34.83 | 32.86 | 2.48 | 78.8% |

The selection rule is **not met**, so `adoptar` is `false` and production remains on v5. Although the cross-validated coverage is within 78–82% for all horizons and v6 beats naive in four horizons, its MAPE is worse than v5 at 36 and 48 months. Therefore this change does not alter `engine.js` or the forecasting pipeline.

Reproduce with `node scripts/calibrate-engine.js [artifact-directory]`. The default directory is `/home/wagustin/kathy_workspace/handoff/bt_data`; the backtest artifacts are kept outside the repository.
