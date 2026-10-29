"""Daily Chronos-2 and TimesFM batch for PerData Engine v6 (timesfm.yml, GitHub CPUs).
One 48-month forecast per asset from data/history-120.json; every horizon from 1 to 48 is a prefix
of it. Writes the raw P10/P25/P50/P75/P90 paths to data/model-forecasts-cache.json; the blend with
Engine v3 and the band calibration are done by scripts/precompute-engine.js.
"""
import json
import os
import time
from datetime import datetime, timezone

import numpy as np
import torch
from chronos import BaseChronosPipeline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_H = 48
QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9]


def next_month(y, m, k):
    m += k
    return y + (m - 1) // 12, (m - 1) % 12 + 1


def main():
    history = json.load(open(os.path.join(ROOT, "data", "history-120.json"), encoding="utf-8"))
    assets = [(s, v) for s, v in sorted(history.items()) if len(v) >= 24]
    print(f"Activos: {len(assets)}")
    pipe = BaseChronosPipeline.from_pretrained("amazon/chronos-2", device_map="cpu")
    t0 = time.perf_counter()
    q, _ = pipe.predict_quantiles([torch.tensor([float(x["close"]) for x in v], dtype=torch.float32) for _, v in assets],
                                  prediction_length=MAX_H, quantile_levels=QUANTILES)
    print(f"Chronos-2: {time.perf_counter() - t0:.0f} s")
    run_at = datetime.now(timezone.utc).isoformat()
    out = []
    for (sym, series), item in zip(assets, q):
        qs = np.sort(np.asarray(item, dtype=np.float64).reshape(MAX_H, len(QUANTILES)), axis=-1)
        y, m = (int(p) for p in series[-1]["date"].split("-")[:2])
        path = []
        for step in range(1, MAX_H + 1):
            yy, mm = next_month(y, m, step)
            p10, p25, p50, p75, p90 = (round(float(v), 6) for v in qs[step - 1])
            path.append({"step": step, "date": f"{yy}-{mm:02d}-01", "p10": p10, "p25": p25, "p50": p50, "p75": p75, "p90": p90})
        out.append({"symbol": sym, "run_at": run_at, "last_close": float(series[-1]["close"]), "chronos2": path})
    tfm_status = {"ok": False, "error": None}
    try:
        from timesfm import TimesFM_2p5_200M_torch, ForecastConfig
        model = TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
        model.compile(ForecastConfig(max_context=128, max_horizon=128, normalize_inputs=True,
                                     use_continuous_quantile_head=True, fix_quantile_crossing=True,
                                     infer_is_positive=True, per_core_batch_size=1))
        inputs = [[float(x["close"]) for x in series] for _, series in assets]
        raw = []
        for start in range(0, len(inputs), 64):
            _, chunk = model.forecast(horizon=MAX_H, inputs=inputs[start:start + 64])
            raw.append(np.asarray(chunk))
        q = np.concatenate(raw, axis=0)
        values = np.stack([q[:, :, 1], (q[:, :, 2] + q[:, :, 3]) / 2, q[:, :, 5],
                           (q[:, :, 7] + q[:, :, 8]) / 2, q[:, :, 9]], axis=-1)
        for row, (_, series), item in zip(out, assets, values):
            qs = np.sort(np.asarray(item, dtype=np.float64), axis=-1)
            y, m = (int(p) for p in series[-1]["date"].split("-")[:2])
            row["timesfm"] = []
            for step, quantiles in enumerate(qs, 1):
                yy, mm = next_month(y, m, step)
                p10, p25, p50, p75, p90 = (round(float(v), 6) for v in quantiles)
                row["timesfm"].append({"step": step, "date": f"{yy}-{mm:02d}-01", "p10": p10,
                                        "p25": p25, "p50": p50, "p75": p75, "p90": p90})
        tfm_status["ok"] = True
        print(f"TimesFM 2.5: {len(out)} rutas de 48 meses")
    except Exception as exc:
        tfm_status["error"] = f"{type(exc).__name__}: {str(exc)[:300]}"
        print(f"TimesFM falló; se usará c=0: {tfm_status['error']}")
    cache_path = os.path.join(ROOT, "data", "model-forecasts-cache.json")
    json.dump(out, open(cache_path, "w"))
    report_path = os.path.join(ROOT, "data", "engine-report.json")
    try:
        report = json.load(open(report_path, encoding="utf-8"))
    except (OSError, ValueError):
        report = {}
    report["timesfm"] = tfm_status
    json.dump(report, open(report_path, "w"), indent=2)
    print(f"Guardadas {len(out)} rutas Chronos-2 de 48 meses")


if __name__ == "__main__":
    main()
