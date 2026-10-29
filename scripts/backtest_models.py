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


def run_chronos2_epu(items):
    """Chronos-2 with publication-lagged monthly EPU values known at each origin."""

    path = os.path.join(ROOT, "data", "official", "epu.json")
    with open(path, encoding="utf-8") as f:
        epu = json.load(f)["series"]
    covariates = {}
    for name in ("PERU", "GLOBAL", "USA"):
        raw = epu.get(name)
        if not raw:
            continue
        # Indices are released with a one-month delay: at month M use the value for M-1.
        covariates[f"epu_{name.lower()}"] = {
            (int(month[:4]), int(month[5:7])): float(value)
            for month, value in raw
        }
    if not covariates:
        raise RuntimeError("No hay series EPU disponibles")

    return _chronos2_with_covariates(items, covariates)

def _chronos2_with_covariates(items, covariates):
    """Chronos-2 with monthly past covariates; at month M only the value for M-1 is known."""
    import pandas as pd
    from chronos import Chronos2Pipeline

    history = json.load(open(os.path.join(ROOT, "data", "history-120.json"), encoding="utf-8"))
    frames, owners, kept = [], [], []
    for sym, t, _ in items:
        series = history[sym][:-1][:t]
        values = []
        for point in series:
            year, mon = map(int, point["date"][:7].split("-"))
            previous = (year - 1, 12) if mon == 1 else (year, mon - 1)
            row = {"id": f"{sym}|{t}", "timestamp": pd.Timestamp(point["date"]), "target": float(point["close"])}
            for col, points in covariates.items():
                if previous not in points:
                    break
                row[col] = points[previous]
            else:
                values.append(row)
        if len(values) < MIN_CONTEXT:
            continue
        frames.extend(values)
        owners.append((f"{sym}|{t}", len(values)))
        kept.append((sym, t, np.asarray([float(p["close"]) for p in series], dtype=np.float32)))
    frame = pd.DataFrame(frames)
    pipe = Chronos2Pipeline.from_pretrained("amazon/chronos-2", device_map="cpu")
    predicted = pipe.predict_df(frame, id_column="id", timestamp_column="timestamp", target="target", prediction_length=MAX_H, quantile_levels=QUANTILES)
    # predict_df returns one row per future timestamp; quantile columns are named by level.
    qcols = [str(q) for q in QUANTILES]
    if not all(c in predicted.columns for c in qcols):
        raise RuntimeError(f"Chronos-2 predict_df: faltan cuantiles {qcols} en {list(predicted.columns)}")
    by_id = {}
    for cut_id, group in predicted.groupby("id", sort=False):
        by_id[str(cut_id)] = group[qcols].to_numpy(dtype=np.float32)[:MAX_H]
    results = []
    for cut_id, _ in owners:
        if cut_id not in by_id or len(by_id[cut_id]) < MAX_H:
            raise RuntimeError(f"Chronos-2 no produjo horizonte completo para {cut_id}")
        results.append(by_id[cut_id])
    return kept, results



def run_chronos2_news(items):
    """Chronos-2 with GDELT monthly news tone and volume (Peru, world, US, China) as past covariates."""
    path = os.path.join(ROOT, "data", "official", "gdelt-news.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    partial = data.get("mes_parcial")
    covariates = {}
    for name in ("pe_tono", "pe_articulos", "pe_goldstein", "mu_tono", "mu_articulos", "us_tono", "ch_tono"):
        raw = data["series"].get(name)
        if not raw:
            continue
        log_scale = name.endswith("_articulos")
        covariates[f"news_{name}"] = {
            (int(month[:4]), int(month[5:7])): float(np.log1p(value)) if log_scale else float(value)
            for month, value in raw if month != partial
        }
    if not covariates:
        raise RuntimeError("No hay series GDELT disponibles")
    return _chronos2_with_covariates(items, covariates)


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
    items = origins()
    print(f"{name}: {len(items)} cortes")
    t0 = time.perf_counter()
    if name in ("chronos2_epu", "chronos2_news"):
        items, q = {"chronos2_epu": run_chronos2_epu, "chronos2_news": run_chronos2_news}[name](items)
    else:
        runner = {"timesfm": run_timesfm, "chronos2": run_chronos2, "tirex": run_tirex}[name]
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
