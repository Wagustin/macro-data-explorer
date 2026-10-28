# PerData Engine v6: calibration report

The saved backtest covers 61 assets and rolling cuts six months apart. P50 MAPE is lower-is-better. v5 values come from the same backtest report; v6 is scored out of sample by selecting the grid weights on one half of assets and evaluating the other half, then reversing the halves. K80 is fitted to those out-of-sample predictions. `—` means the selected blend has zero-width bands for enough predictions that no finite K80 can reach 80% coverage.

| Horizon (months) | v5 MAPE | v6 MAPE OOS | No-change MAPE | v6 K80 | v6 coverage OOS |
|---:|---:|---:|---:|---:|---:|
| 1 | 5.50 | 5.40 | 5.37 | — | — |
| 3 | 11.40 | 10.86 | 10.77 | — | — |
| 6 | 17.10 | 15.81 | 15.81 | — | — |
| 12 | 21.75 | 21.03 | 20.92 | 8.75 | 80.1% |
| 24 | 28.88 | 29.41 | 28.27 | — | — |
| 36 | 31.45 | 33.23 | 31.75 | — | — |
| 48 | 34.55 | 36.24 | 33.09 | — | — |

The grid step is 0.05. The central estimate is `a × Chronos-2 + b × v3 + (1 − a − b) × last close`. At short horizons the best weights put almost all mass on the last close, whose zero-width band cannot be widened to the target coverage with a finite multiplier. At 24–48 months v6 also fails to beat v5 and the no-change baseline consistently. Therefore `adoptar` is `false`; production remains on v5 and `api/_lib/engine.js` is unchanged.

Reproduce with `node scripts/calibrate-engine.js [artifact-directory]`. The default directory is the local handoff at `/home/wagustin/kathy_workspace/handoff/bt_data`; it contains the backtest outputs and is intentionally not copied into the repository.
