"""Rolling-origin backtest of the open forecasting models (runs in backtest.yml on GitHub, not on
the home server). For every asset in data/history-120.json and every origin (cut every 6 months,
at least 36 months of context), the model forecasts 48 months ahead from the history up to the
cut. Writes data/backtest/<model>.json with the raw P10/P25/P50/P75/P90 paths per origin; the
scoring (with Engine v3 and the blends) is done by scripts/backtest-evaluate.js.

Usage: python scripts/backtest_models.py timesfm|chronos2|tirex
"""
import json
import os
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_H = 48
MIN_CONTEXT = 36
STEP = 6
QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9]


def origins():
    """[(symbol, t, context)] where context is closes[:t]. The last month is dropped: it is still open."""
    history = json.load(open(os.path.join(ROOT, "data", "history-120.json"), encoding="utf-8"))
    out = []
    for sym, series in sorted(history.items()):
        closes = [float(x["close"]) for x in series][:-1]
        for t in range(MIN_CONTEXT, len(closes), STEP):
            out.append((sym, t, np.array(closes[:t], dtype=np.float32)))
    return out


def run_timesfm(ctx):
    import torch  # noqa: F401
    from timesfm import TimesFM_2p5_200M_torch, ForecastConfig
    model = TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
    model.compile(ForecastConfig(max_context=128, max_horizon=128, normalize_inputs=True,
                                 use_continuous_quantile_head=True, fix_quantile_crossing=True,
                                 infer_is_positive=True, per_core_batch_size=1))
    res = []
    for b in range(0, len(ctx), 64):
        _, q = model.forecast(horizon=MAX_H, inputs=ctx[b:b + 64])
        # quantile head: index 0 is the mean, then deciles 0.1 ... 0.9
        q = np.asarray(q)
        res.append(np.stack([q[:, :, 1], (q[:, :, 2] + q[:, :, 3]) / 2, q[:, :, 5], (q[:, :, 7] + q[:, :, 8]) / 2, q[:, :, 9]], axis=-1))
    return np.concatenate(res, axis=0)


def run_chronos2(ctx):
    import torch
    from chronos import BaseChronosPipeline
    pipe = BaseChronosPipeline.from_pretrained("amazon/chronos-2", device_map="cpu")
    res = []
    for b in range(0, len(ctx), 64):
        batch = [torch.tensor(c) for c in ctx[b:b + 64]]
        q, _ = pipe.predict_quantiles(batch, prediction_length=MAX_H, quantile_levels=QUANTILES)
        for item in q:
            res.append(np.asarray(item, dtype=np.float32).reshape(MAX_H, len(QUANTILES)))
    return np.stack(res)


def run_tirex(ctx):
    import torch
    from tirex import load_model
    model = load_model("NX-AI/TiRex", backend="torch", device="cpu")
    res = []
    for b in range(0, len(ctx), 64):
        batch = [torch.tensor(c) for c in ctx[b:b + 64]]
        q, _ = model.forecast(context=batch, prediction_length=MAX_H)
        q = np.asarray(q)  # (N, H, 9): 0.1 ... 0.9
        res.append(np.stack([q[:, :, 0], (q[:, :, 1] + q[:, :, 2]) / 2, q[:, :, 4], (q[:, :, 6] + q[:, :, 7]) / 2, q[:, :, 8]], axis=-1))
    return np.concatenate(res, axis=0)


def main():
    name = sys.argv[1]
    runner = {"timesfm": run_timesfm, "chronos2": run_chronos2, "tirex": run_tirex}[name]
    items = origins()
    print(f"{name}: {len(items)} cortes")
    t0 = time.perf_counter()
    q = runner([c for _, _, c in items])
    print(f"{name}: {time.perf_counter() - t0:.0f} s")
    out = {}
    for (sym, t, _), qs in zip(items, q):
        qs = np.sort(np.asarray(qs, dtype=np.float64), axis=-1)  # no quantile crossing
        out[f"{sym}|{t}"] = [[round(float(v), 6) for v in row] for row in qs]
    os.makedirs(os.path.join(ROOT, "data", "backtest"), exist_ok=True)
    json.dump({"model": name, "quantiles": QUANTILES, "forecasts": out},
              open(os.path.join(ROOT, "data", "backtest", f"{name}.json"), "w"))


if __name__ == "__main__":
    main()
