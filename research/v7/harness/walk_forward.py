"""Walk-forward evaluation engine and reference models (V7 H1).

``walk_forward`` is the measuring rod of the V7 program: for every cut date
starting at ``inicio`` it rebuilds the information available at that cut with
``cargar_serie`` (only rows with ``fecha_disponible <= corte``), calls the
model with the history and the horizons, and scores the realized values
exactly ``h`` business days later.

Reference models included:
  - paseo aleatorio (last close) with EWMA-scaled FHS-style bands,
  - con deriva (EWMA of log returns, scaled bands),
  - the current daily engine (Python replica of ``scripts/engine-daily.js``:
    FHS with EWMA volatility, P50 random walk, expansive-K calibration),
  - ETS (statsmodels ``ExponentialSmoothing``) with simulated quantiles,
  - ARIMA(1,1,0) (statsmodels) with Gaussian quantiles.

Overlapping multi-day forecasts induce autocorrelation in the forecast
errors. Direction accuracy is tested on non-overlapping cuts only (cuts
spaced ``h`` business days apart), which removes the overlap by construction.
HAC corrections are not used because the non-overlapping subset needs no
correction; both are reported in the metrics notes.

Evidence: ``research/v7/resultados/harness-resultados.json`` predates the
``_escalar_sigma`` fix recorded below (prices ~3.4 fed where return
volatility ~0.002 belonged, inflating bands ~1500x); the committed report
numbers are reproduced by re-running ``baselines.py`` with the current code.
"""
from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pandas as pd
from scipy import stats

from .datos import cargar_serie

QUANTILES = (0.10, 0.25, 0.50, 0.75, 0.90)


class _FHS:
    """Filtered historical simulation replicas (engine-daily.js math).

    All helpers mirror the JS: EWMA volatility (lambda 0.94, initialised from
    the sample variance of the first window), EWMA drift, and empirical
    quantiles with the JS indexing rule. Positional (business-row) arithmetic,
    no calendar arithmetic.
    """

    def __init__(self, valores: np.ndarray, lambda_: float = 0.94):
        self.p = np.asarray(valores, dtype=float)
        self.n = len(self.p)
        p_prev = np.maximum(self.p[:-1], 1e-3)
        p_curr = np.maximum(self.p[1:], 1e-3)
        self.u = np.concatenate([[0.0], np.log(p_curr / p_prev)])
        if self.n >= 2:
            init = int(min(30, max(5, self.n // 4)))
        else:
            init = 1
        sig2 = np.zeros(self.n)
        if self.n >= 2:
            sig2[0] = max(1e-8, float(np.sum(self.u[1 : init + 1] ** 2) / init))
        else:
            sig2[0] = 1e-8
        for i in range(1, self.n):
            sig2[i] = lambda_ * sig2[i - 1] + (1 - lambda_) * self.u[i] ** 2
        self.sigma = np.sqrt(np.maximum(sig2, 1e-8))
        mu = np.zeros(self.n)
        for i in range(1, self.n):
            mu[i] = lambda_ * mu[i - 1] + (1 - lambda_) * self.u[i]
        self.mu = mu

    def retorno_h(self, tau: int, h: int) -> float:
        return float(np.log(max(self.p[tau], 1e-6) / max(self.p[tau - h], 1e-6)))

    def retorno_reescalado(self, t: int, h: int, ventana: int) -> np.ndarray:
        inicio = max(h, t - ventana)
        taus = np.arange(inicio, t + 1)
        r = np.log(np.maximum(self.p[taus], 1e-6) / np.maximum(self.p[taus - h], 1e-6))
        s_ratio = self.sigma[t] / self.sigma[taus]
        return r * s_ratio

    def cuantiles_fhs(self, t: int, h: int, ventana: int) -> dict:
        rs = np.sort(self.retorno_reescalado(t, h, ventana))
        return {f"q{int(q * 100)}": _cuantil_js(rs, q) for q in (0.10, 0.25, 0.75, 0.90)}


def _cuantil_js(ordenados: np.ndarray, q: float) -> float:
    """empiricalQuantile from engine-daily.js: floor(q * n) indexing."""
    if len(ordenados) == 0:
        return 0.0
    idx = min(len(ordenados) - 1, max(0, int(np.floor(q * len(ordenados)))))
    return float(ordenados[idx])


def _bandas_normales(p50: float, sigma: float, factor_k: float = 1.0) -> dict:
    z = {0.10: -1.2815515655446004, 0.25: -0.6744897501960817,
         0.75: 0.6744897501960817, 0.90: 1.2815515655446004}
    out = {}
    for q, zq in z.items():
        out[f"p{int(q*100)}"] = float(p50 * np.exp(factor_k * zq * sigma))
    return out


def _escalar_sigma(sigma_hist: np.ndarray, h: int, lambda_: float = 0.94) -> float:
    """EWMA volatility scaled to an h-day sigma (in log-return units).

    ``sigma_hist`` is the per-day EWMA sigma series from ``_FHS.sigma``
    (NOT raw prices).  The h-day sigma is sqrt(mean(sigma^2 over the last h
    days) * h).  Passing raw prices here scales by the price level (~3.4)
    instead of the return volatility (~0.002) and inflates the bands 1500x.
    """
    if len(sigma_hist) == 0:
        return 0.0
    ventana = np.asarray(sigma_hist[-h :], dtype=float) ** 2
    promedio = float(np.average(ventana)) if len(ventana) else 0.0
    return float(np.sqrt(max(promedio * h, 0.0)))


def _cerrar(p10: float, p25: float, p50: float, p75: float, p90: float) -> dict:
    qs = sorted([float(p10), float(p25), float(p50), float(p75), float(p90)])
    return {"p10": qs[0], "p25": qs[1], "p50": qs[2], "p75": qs[3], "p90": qs[4]}


# ---------- Reference model factories ----------
# Every factory returns a model f(historia, h, covariables_hasta_corte) as the
# brief requires. `historia` is the values available up to the cut (oldest
# first), `h` the horizon in business days, `covariables_hasta_corte` an
# optional dict of covariates already available at the cut (never forward
# looking; callers build it from cargar_serie with como_de=corte).


def modelo_paseo_aleatorio() -> Callable:
    def f(historia, h, covariables_hasta_corte=None):
        historia = np.asarray(historia, dtype=float)
        pT = float(historia[-1])
        sigma_h = _escalar_sigma(_FHS(historia).sigma, h)
        bandas = _bandas_normales(pT, sigma_h)
        return _cerrar(bandas["p10"], bandas["p25"], pT, bandas["p75"], bandas["p90"])

    return f


def modelo_deriva() -> Callable:
    """Random walk plus EWMA drift mu*h, with EWMA-scaled bands."""

    def f(historia, h, covariables_hasta_corte=None):
        fhs = _FHS(np.asarray(historia, dtype=float))
        pT = float(historia[-1])
        mu = float(fhs.mu[-1])
        p50 = pT * float(np.exp(h * mu))
        sigma_h = _escalar_sigma(fhs.sigma, h)
        bandas = _bandas_normales(p50, sigma_h)
        return _cerrar(bandas["p10"], bandas["p25"], p50, bandas["p75"], bandas["p90"])

    return f


def modelo_motor_diario() -> Callable:
    """Python replica of scripts/engine-daily.js (FHS + EWMA vol + RW P50).

    K is calibrated expensively: at each cut it uses only the needs realized
    before that cut (the JS 'expansivo' variant), never the full sample.
    Rebuilding the calibration on every call is O(cuts) per model; use
    ``reentrenar_cada=1`` for RW/drift and do NOT mix this model with the heavy
    ETS/ARIMA retraining loop when iterating cuts by hand.
    """

    def f(historia, h, covariables_hasta_corte=None):
        valores = np.asarray(historia, dtype=float)
        fhs = _FHS(valores)
        pT = float(valores[-1])
        ventana = min(756, max(h + 1, len(valores) - h))
        q = fhs.cuantiles_fhs(len(valores) - 1, h, ventana)
        # Need of the last realized h-day move under the same FHS scaling.
        if len(valores) > h:
            delta = fhs.retorno_h(len(valores) - 1, h)
            if delta >= 0:
                need = (delta / q["q90"]) if q["q90"] > 0 else 1.0
            else:
                need = (delta / q["q10"]) if q["q10"] < 0 else 1.0
            need = max(0.0, float(need))
        else:
            need = 0.0
        f._needs.append(need)
        k = _cuantil_js(np.sort(np.asarray(f._needs, dtype=float)), 0.80)
        k = k if k > 1e-12 else 1.0
        # Bands are the JS construction; keep them ordered via _cerrar.
        p10 = pT * float(np.exp(k * q["q10"]))
        p25 = pT * float(np.exp(k * q["q25"]))
        p75 = pT * float(np.exp(k * q["q75"]))
        p90 = pT * float(np.exp(k * q["q90"]))
        return _cerrar(p10, p25, pT, p75, p90)

    f._needs: list[float] = []
    return f


def modelo_ets() -> Callable:
    """ETS damped-trend point forecast with EWMA-scaled quantile bands.

    Uses ``ExponentialSmoothing(trend='add', damped_trend=True).forecast(h)``
    for the point (p50 = the last step of the forecast path, which anchors
    the band at the model's own multi-day level) and h-day FHS-style bands
    pulled from an EWMA volatility estimate, expressed as log-returns around
    the forecast at step h. ``HoltWintersResults.simulate`` is not used: with
    smoothed trend, its conditional simulation does not approximate the
    fitted data path as anchor='end' (verified during development) and adds
    ~50 ms per fit for no gain in point accuracy.

    The fit is memoized on the exact history array: ``walk_forward`` calls
    the model once per horizon with the same history, so fitting once per
    cut (not once per h) is byte-identical and ~3x faster.
    """

    def f(historia, h, covariables_hasta_corte=None):
        import warnings

        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        valores = np.asarray(historia, dtype=float)
        clave = (valores.shape, float(valores[-1]), float(valores.sum()))
        if f._cache is not None and f._cache[0] == clave:
            fc = f._cache[1]
            if len(fc) >= h:
                p50 = float(fc[h - 1])
                fhs = _FHS(valores)
                sigma_h = _escalar_sigma(fhs.sigma, h)
                bandas = _bandas_normales(p50, sigma_h)
                return _cerrar(bandas["p10"], bandas["p25"], p50, bandas["p75"], bandas["p90"])
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                res = ExponentialSmoothing(
                    valores, trend="add", damped_trend=True
                ).fit(optimized=True)
            fc = np.asarray(res.forecast(21), dtype=float)
            if len(fc) < h:
                fc = np.asarray(res.forecast(int(h)), dtype=float)
            f._cache = (clave, fc.copy())
        except Exception:
            return modelo_deriva()(historia, h, covariables_hasta_corte)
        p50 = float(fc[h - 1]) if len(fc) >= h else float(fc[-1])
        fhs = _FHS(valores)
        sigma_h = _escalar_sigma(fhs.sigma, h)
        bandas = _bandas_normales(p50, sigma_h)
        return _cerrar(bandas["p10"], bandas["p25"], p50, bandas["p75"], bandas["p90"])

    f._cache = None
    return f


def _prediccion_valida(pred: dict) -> bool:
    """True si la predicción trae los cinco cuantiles finitos y ordenados."""
    try:
        vals = [float(pred[k]) for k in ("p10", "p25", "p50", "p75", "p90")]
    except (KeyError, TypeError, ValueError):
        return False
    return all(np.isfinite(vals)) and all(
        a <= b for a, b in zip(vals, vals[1:])
    )


def modelo_arima() -> Callable:
    """ARIMA(1,1,0) (paseo aleatorio diferenciable) con cuantiles gaussianos.

    Like ``modelo_ets``, the fit is memoized on the exact history array so
    one fit serves the three horizon calls made at each cut.
    """

    def f(historia, h, covariables_hasta_corte=None):
        import warnings

        from statsmodels.tsa.arima.model import ARIMA

        valores = np.asarray(historia, dtype=float)
        if len(valores) < 10 or not np.all(np.isfinite(valores)):
            return modelo_paseo_aleatorio()(historia, h, covariables_hasta_corte)
        clave = (valores.shape, float(valores[-1]), float(valores.sum()))
        if f._cache is not None and f._cache[0] == clave:
            sf = f._cache[1]
            mean = float(sf["mean"].iloc[h - 1])
            lower75 = float(sf["mean_ci_lower"].iloc[h - 1])
            upper75 = float(sf["mean_ci_upper"].iloc[h - 1])
            return _bandas_arima(mean, lower75, upper75, historia, h, covariables_hasta_corte)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                res = ARIMA(valores, order=(1, 1, 0)).fit()
                sf = res.get_forecast(steps=21).summary_frame(alpha=0.2)
                if len(sf) < 21:
                    sf = res.get_forecast(steps=int(h)).summary_frame(alpha=0.2)
                    f._cache = (clave, None)
                    mean = float(sf["mean"].iloc[-1])
                    lower75 = float(sf["mean_ci_lower"].iloc[-1])
                    upper75 = float(sf["mean_ci_upper"].iloc[-1])
                    return _bandas_arima(mean, lower75, upper75, historia, h, covariables_hasta_corte)
                f._cache = (clave, sf)
                mean = float(sf["mean"].iloc[h - 1])
                lower75 = float(sf["mean_ci_lower"].iloc[h - 1])
                upper75 = float(sf["mean_ci_upper"].iloc[h - 1])
                return _bandas_arima(mean, lower75, upper75, historia, h, covariables_hasta_corte)
            except Exception:
                return modelo_paseo_aleatorio()(historia, h, covariables_hasta_corte)

    f._cache = None
    return f


def _bandas_arima(mean, lower75, upper75, historia, h, covariables_hasta_corte=None):
    """Gaussian bands from the ARIMA 80% CI, widened to cover the CI."""
    # El CI al alpha 0.2 es el intervalo 80% [p10, p90] sobre la media.
    sigma_h = max((max(upper75, lower75) - mean), 0.0) / 1.2815515655446004
    sigma_rel = sigma_h / max(mean, 1e-9) if mean != 0 else sigma_h
    if mean <= 0 or not np.isfinite(sigma_rel):
        return modelo_paseo_aleatorio()(historia, h, covariables_hasta_corte)
    bandas = _bandas_normales(mean, sigma_rel)
    if lower75 > 0:
        bandas["p10"] = min(bandas["p10"], lower75)
    if upper75 > 0:
        bandas["p90"] = max(bandas["p90"], upper75)
    cand = _cerrar(bandas["p10"], bandas["p25"], mean, bandas["p75"], bandas["p90"])
    if not _prediccion_valida(cand):
        return modelo_paseo_aleatorio()(historia, h, covariables_hasta_corte)
    return cand


# ---------- Walk-forward ----------


def _indice_realizacion(fechas: np.ndarray, i: int, h: int) -> int:
    """Index of the date exactly h business rows after the cut index i."""
    return i + h


def walk_forward(
    modelo: Callable,
    serie,
    inicio: str = "2019-01-02",
    horizontes: tuple[int, ...] = (1, 5, 21),
    reentrenar_cada: int = 1,
    nombre: str = "",
) -> pd.DataFrame:
    """Rolling-origin evaluation with strict no-lookahead.

    Parameters:
        modelo: callable ``f(historia, h, covariables_hasta_corte)`` returning
            ``{p10, p25, p50, p75, p90}``. It receives only values with
            ``fecha_disponible <= corte``.
        serie: DataFrame with ``fecha, valor, fecha_disponible`` (from
            :func:`harness.datos.cargar_serie`) or a series id string.
        inicio: first cut date (ISO). Every cut date >= inicio is evaluated.
        horizontes: business-day horizons (default 1, 5, 21).
        reentrenar_cada: refit cadence in business days. Stateless models
            (random walk, drift, ETS, ARIMA) rebuild cheaply and are fitted
            per call by themselves regardless. Models that carry a factory
            (``modelo.fabrica = factory``) are rebuilt every ``reentrenar_cada``
            business-day cuts on the cadence grid; this is how baselines.py
            throttles the heavy ETS/ARIMA refits (cadencia 21). Plain
            callables are used as-is: their internal state persists across
            cuts by design. Stateful accumulators (motor diario needs) use
            the expanding calibration across calls and must not be rebuilt
            (baselines runs them with cadencia 1).
        nombre: model label recorded in every row.

    Returns long DataFrame with one row per (corte, horizonte):
    ``modelo, corte, fecha_objetivo, horizonte, p10, p25, p50, p75, p90, real``.
    """
    from datetime import datetime  # noqa: F401  (kept for parity with repo style)

    if isinstance(serie, str):
        df = cargar_serie(serie)
    else:
        df = serie
    df = df.sort_values("fecha").reset_index(drop=True)
    fechas = df["fecha"].to_numpy()
    vals = df["valor"].to_numpy(dtype=float)
    disponibles = df["fecha_disponible"].to_numpy()

    if len(df) == 0:
        return pd.DataFrame(
            columns=["modelo", "corte", "fecha_objetivo", "horizonte",
                     "p10", "p25", "p50", "p75", "p90", "real"]
        )

    nombre = nombre or getattr(modelo, "__name__", None) or type(modelo).__name__
    fabrica = getattr(modelo, "fabrica", None)
    # Cadencia de reentrenamiento: los modelos que traen una fábrica
    # (``.fabrica = factory``, los pesados que se reconstruirían cada vez)
    # se reconstruyen cada ``reentrenar_cada`` cortes en la rejilla.
    # Los callables planos se usan tal cual; el motor diario acumula needs
    # y no debe reconstruirse (por eso corre con cadencia 1, ver baselines).
    if fabrica is not None and reentrenar_cada > 0:
        instancia = fabrica()
    else:
        instancia = None

    filas = []
    cortes = [i for i, f in enumerate(fechas) if f >= inicio]
    for posicion, i in enumerate(cortes):
        if fabrica is not None and reentrenar_cada > 0 and (posicion % reentrenar_cada == 0):
            instancia = fabrica()
        corte = str(fechas[i])
        # No lookahead, enforced at the data level independent of the model:
        # history available at the cut = rows with fecha_disponible <= corte.
        mask = disponibles <= corte
        # Map back to positional history up to i, intersected with availability.
        historia = []
        for j in range(len(df)):
            if j <= i and bool(mask[j]):
                historia.append(vals[j])
        # Guard: if availability filter is stricter than position (e.g. a
        # delayed backfill), history ends at the last available row <= corte.
        historia = np.asarray(historia, dtype=float)
        if len(historia) == 0:
            continue
        pT = float(historia[-1])
        for h in horizontes:
            j = _indice_realizacion(fechas, i, h)
            if j >= len(df):
                continue
            fn = instancia if (fabrica is not None and reentrenar_cada > 0) else modelo
            try:
                pred = fn(historia, h, None)
                if not _prediccion_valida(pred):
                    raise ValueError("predicción no finita o desordenada")
            except Exception:
                # A failed fit must not break the whole walk-forward; fall
                # back to the random walk for this (cut, h).
                pred = modelo_paseo_aleatorio()(historia, h, None)
            real = float(vals[j])
            filas.append(
                {
                    "modelo": nombre,
                    "corte": corte,
                    "fecha_objetivo": str(fechas[j]),
                    "horizonte": int(h),
                    "p10": float(pred["p10"]),
                    "p25": float(pred["p25"]),
                    "p50": float(pred["p50"]),
                    "p75": float(pred["p75"]),
                    "p90": float(pred["p90"]),
                    "real": real,
                    "pT": pT,
                }
            )

    out = pd.DataFrame(filas)
    if len(out):
        out = out[["modelo", "corte", "fecha_objetivo", "horizonte",
                   "p10", "p25", "p50", "p75", "p90", "real", "pT"]]
    return out


# ---------- Metrics ----------


def _mae(e: np.ndarray) -> float:
    return float(np.mean(np.abs(e))) if len(e) else float("nan")


def _rmse(e: np.ndarray) -> float:
    return float(np.sqrt(np.mean(e**2))) if len(e) else float("nan")


def _mape(df: pd.DataFrame) -> float:
    real = df["real"].to_numpy(dtype=float)
    p50 = df["p50"].to_numpy(dtype=float)
    ok = real != 0
    if not ok.any():
        return float("nan")
    return float(np.mean(np.abs(p50[ok] - real[ok]) / np.abs(real[ok])) * 100.0)


def _pinball(real: np.ndarray, q: float, pred: np.ndarray) -> float:
    if len(real) == 0:
        return float("nan")
    d = real - pred
    return float(np.mean(np.maximum(q * d, (q - 1) * d)))


def direccion_acierto(df: pd.DataFrame, h: int) -> tuple[float, int, float]:
    """Direction accuracy on non-overlapping cuts (h-business-day spaced).

    The brief requires either non-overlapping cuts or an autocorrelation
    correction for the overlap. We use non-overlapping cuts: daily cuts are
    sub-sampled every h business days, so consecutive evaluated forecasts do
    not share the same realized window, and the binomial p-value against 50%
    is valid without HAC adjustment. Zero changes (real == pT) are excluded.

    A model whose point forecast never moves (random walk, daily-engine P50
    == last close) carries no directional signal: its predicted change is
    exactly zero on every cut, so ``sign(pred) == sign(real)`` would never
    hold and accuracy would read 0 % for a degenerate reason. Those models
    report (nan, n, nan) instead — "no directional signal" — which keeps
    the honest question ("does the model call the direction?") distinct from
    the MAE ranking.
    Returns (accuracy, n, two-sided binomial p-value).
    """
    sub = df[df["horizonte"] == h].copy().reset_index(drop=True)
    if len(sub) == 0:
        return float("nan"), 0, float("nan")
    # Keep every h-th cut in date order: positional spacing via fecha_objetivo
    # index proximity; using row order with step h approximates non-overlap
    # because daily cuts are consecutive business rows for fixed h.
    sub = sub.iloc[::h]
    cambios = sub["real"].to_numpy(dtype=float) - sub["pT"].to_numpy(dtype=float)
    preds = sub["p50"].to_numpy(dtype=float) - sub["pT"].to_numpy(dtype=float)
    ok = cambios != 0
    cambios, preds = cambios[ok], preds[ok]
    n = len(cambios)
    if n == 0:
        return float("nan"), 0, float("nan")
    if not np.any(preds != 0):
        return float("nan"), n, float("nan")
    aciertos = int(np.sum(np.sign(cambios) == np.sign(preds)))
    acc = aciertos / n
    p = float(stats.binomtest(aciertos, n, 0.5, alternative="two-sided").pvalue)
    return acc, n, p


def diebold_mariano(e1: np.ndarray, e2: np.ndarray) -> tuple[float, float]:
    """DM test with the Harvey-Leybourne-Newbold small-sample correction.

    Returns (statistic, two-sided p-value). Handles constant loss
    differentials (a perfect-forecast tie) without division by zero.
    """
    e1 = np.asarray(e1, dtype=float)
    e2 = np.asarray(e2, dtype=float)
    n = min(len(e1), len(e2))
    if n < 3:
        return float("nan"), float("nan")
    e1, e2 = e1[:n], e2[:n]
    d = e1**2 - e2**2
    media = float(np.mean(d))
    if float(np.var(d)) < 1e-18:
        if abs(media) < 1e-18:
            return 0.0, 1.0
        return float(np.sign(media) * np.inf), 0.0
    # HAC long-run variance (Bartlett, lag floor(h-1) approximated by 1 step
    # for overlapping daily errors) — the conservative plug-in.
    gamma0 = float(np.var(d, ddof=1))
    gamma1 = float(np.cov(d[:-1], d[1:], ddof=1)[0, 1]) if n > 2 else 0.0
    lrv = gamma0 + 2 * max(gamma1, 0.0) if gamma1 > 0 else gamma0
    lrv = max(lrv, 1e-18)
    dm = media / np.sqrt(lrv / n)
    # Harvey-Leybourne-Newbold small-sample correction, here with h=1:
    # scale by sqrt((n + 1 - 2 + (1*0)/n) / n) = sqrt((n - 1) / n).
    hln = float(np.sqrt((n - 1) / n) * dm) if n >= 2 else float(dm)
    p = float(2 * stats.t.sf(abs(hln), n - 1))
    return float(hln), p


def metricas(res_df: pd.DataFrame) -> dict:
    """All headline metrics, by horizon and by year.

    Returns dict with keys ``por_horizonte`` and ``por_anio`` (nested by
    horizon then year). Each entry holds MAE, RMSE, their ratios to the
    random walk (which is itself row the ``paseo aleatorio``), MAPE,
    direction accuracy (+binomial p on non-overlapping cuts), share within
    ±1% and ±0.5%, pinball per quantile, 80%/50% coverage, mean width and the
    Diebold-Mariano test against the random walk.
    """
    res: dict = {"por_horizonte": {}, "por_anio": {}}
    if len(res_df) == 0:
        return res
    rw = res_df[res_df["modelo"] == "paseo aleatorio"]
    for h, g in res_df.groupby("horizonte"):
        g = g.copy()
        g["error"] = g["p50"] - g["real"]
        rw_h = rw[rw["horizonte"] == h]
        if len(rw_h):
            e_rw = rw_h["p50"].to_numpy(dtype=float) - rw_h["real"].to_numpy(dtype=float)
            # Alinear DM por fecha de corte (intersección de cortes).
            fechas_r = rw_h.set_index("corte")["real"]
            fechas_m = g.set_index("corte")["real"]
            comunes = fechas_r.index.intersection(fechas_m.index)
            if len(comunes):
                g_dm = g.set_index("corte").loc[comunes]
                rw_dm = rw_h.set_index("corte").loc[comunes]
                e_rw_dm = rw_dm["p50"].to_numpy(dtype=float) - rw_dm["real"].to_numpy(dtype=float)
                e_m_dm = g_dm["p50"].to_numpy(dtype=float) - g_dm["real"].to_numpy(dtype=float)
                dm, dm_p = diebold_mariano(e_m_dm, e_rw_dm)
            else:
                dm, dm_p = float("nan"), float("nan")
        else:
            dm, dm_p = float("nan"), float("nan")

        acc, n_dir, p_dir = direccion_acierto(g, int(h))
        real = g["real"].to_numpy(dtype=float)
        p50 = g["p50"].to_numpy(dtype=float)
        desv = np.abs(p50 - real) / np.maximum(np.abs(real), 1e-12)
        dentro1 = float(np.mean(desv <= 0.01) * 100.0)
        dentro05 = float(np.mean(desv <= 0.005) * 100.0)
        cov80 = float(np.mean((real >= g["p10"].to_numpy()) & (real <= g["p90"].to_numpy())) * 100.0)
        cov50 = float(np.mean((real >= g["p25"].to_numpy()) & (real <= g["p75"].to_numpy())) * 100.0)
        # Mean band width in % of the cut price (pT), matching the JS
        # engine's ancho_banda_pct = (p90-p10)/p50*100 (p50 == pT for RW).
        pT = g["pT"].to_numpy(dtype=float)
        ancho = float(np.mean((g["p90"].to_numpy() - g["p10"].to_numpy()) / np.maximum(np.abs(pT), 1e-12)) * 100.0)
        pinball = {
            f"p{int(q*100)}": _pinball(real, q, g[f"p{int(q*100)}"].to_numpy(dtype=float))
            for q in QUANTILES
        }
        res["por_horizonte"][int(h)] = {
            "mae": _mae(g["error"].to_numpy(dtype=float)),
            "rmse": _rmse(g["error"].to_numpy(dtype=float)),
            "mae_rw": _mae(e_rw) if len(rw_h) else float("nan"),
            "rmse_rw": _rmse(e_rw) if len(rw_h) else float("nan"),
            "mape": _mape(g),
            "direccion": acc,
            "direccion_n": n_dir,
            "direccion_p": p_dir,
            "dentro_1pct": dentro1,
            "dentro_05pct": dentro05,
            "pinball": pinball,
            "cobertura_80": cov80,
            "cobertura_50": cov50,
            "ancho_medio_pct": ancho,
            "dm_p_vs_rw": dm_p,
            "dm_vs_rw": dm,
            "n": int(len(g)),
        }
        res["por_anio"][int(h)] = {}
        g["anio"] = g["corte"].str[:4]
        for anio, ga in g.groupby("anio"):
            ga = ga.copy()
            ga["error"] = ga["p50"] - ga["real"]
            rw_a = rw_h[rw_h["corte"].str[:4] == anio] if len(rw_h) else rw_h
            e_rw_a = rw_a["p50"].to_numpy(dtype=float) - rw_a["real"].to_numpy(dtype=float) if len(rw_a) else np.array([])
            acc_a, n_a, p_a = direccion_acierto(ga, int(h))
            real_a = ga["real"].to_numpy(dtype=float)
            p50_a = ga["p50"].to_numpy(dtype=float)
            desv_a = np.abs(p50_a - real_a) / np.maximum(np.abs(real_a), 1e-12)
            res["por_anio"][int(h)][str(anio)] = {
                "mae": _mae(ga["error"].to_numpy(dtype=float)),
                "rmse": _rmse(ga["error"].to_numpy(dtype=float)),
                "mae_rw": _mae(e_rw_a),
                "rmse_rw": _rmse(e_rw_a),
                "mape": _mape(ga),
                "direccion": acc_a,
                "direccion_n": n_a,
                "direccion_p": p_a,
                "dentro_1pct": float(np.mean(desv_a <= 0.01) * 100.0) if len(desv_a) else float("nan"),
                "dentro_05pct": float(np.mean(desv_a <= 0.005) * 100.0) if len(desv_a) else float("nan"),
                "pinball": {
                    f"p{int(q*100)}": _pinball(real_a, q, ga[f"p{int(q*100)}"].to_numpy(dtype=float))
                    for q in QUANTILES
                },
                "cobertura_80": float(np.mean((real_a >= ga["p10"].to_numpy()) & (real_a <= ga["p90"].to_numpy())) * 100.0),
                "cobertura_50": float(np.mean((real_a >= ga["p25"].to_numpy()) & (real_a <= ga["p75"].to_numpy())) * 100.0),
                "ancho_medio_pct": float(np.mean((ga["p90"].to_numpy() - ga["p10"].to_numpy()) / np.maximum(np.abs(ga["pT"].to_numpy(dtype=float)), 1e-12)) * 100.0),
                "n": int(len(ga)),
            }
    return res


def resumen_por_modelo(res_df: pd.DataFrame) -> pd.DataFrame:
    """One row per model (and per horizon) with relative metrics vs the RW."""
    filas = []
    for (modelo, h), g in res_df.groupby(["modelo", "horizonte"]):
        g = g.copy()
        g["error"] = g["p50"] - g["real"]
        acc, n_dir, p_dir = direccion_acierto(g, int(h))
        real = g["real"].to_numpy(dtype=float)
        p50 = g["p50"].to_numpy(dtype=float)
        desv = np.abs(p50 - real) / np.maximum(np.abs(real), 1e-12)
        filas.append(
            {
                "modelo": modelo,
                "horizonte": int(h),
                "mae": _mae(g["error"].to_numpy(dtype=float)),
                "rmse": _rmse(g["error"].to_numpy(dtype=float)),
                "mape": _mape(g),
                "direccion": acc,
                "direccion_n": n_dir,
                "direccion_p": p_dir,
                "dentro_1pct": float(np.mean(desv <= 0.01) * 100.0),
                "dentro_05pct": float(np.mean(desv <= 0.005) * 100.0),
                "cobertura_80": float(np.mean((real >= g["p10"].to_numpy()) & (real <= g["p90"].to_numpy())) * 100.0),
                "cobertura_50": float(np.mean((real >= g["p25"].to_numpy()) & (real <= g["p75"].to_numpy())) * 100.0),
                "ancho_medio_pct": float(np.mean((g["p90"].to_numpy() - g["p10"].to_numpy()) / np.maximum(np.abs(g["pT"].to_numpy(dtype=float)), 1e-12)) * 100.0),
                "pinball_50": _pinball(real, 0.50, p50),
                "n": int(len(g)),
            }
        )
    return pd.DataFrame(filas)
