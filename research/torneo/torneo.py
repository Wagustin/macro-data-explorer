#!/usr/bin/env python3
"""Torneo del motor, ronda 2.
 
Varios motores aprenden solo con datos anteriores a cada día y predicen, día por día, el rango del
precio a 1, 5 y 21 días hábiles. Práctica 2021-2024 (ahí se eligen los ajustes), examen 2025 (ajustes
congelados) y confirmación 2026 (nunca se usa para elegir nada).
 
Regla de no hacer trampa: la predicción del corte c solo usa precios hasta c, noticias de días
anteriores a c (las del corpus se usan hasta las 05:00 de Lima de la mañana siguiente al corte, cuando
se arma el correo) y fechas de calendario anunciadas con antelación. --autoprueba lo comprueba.

  python research/torneo/torneo.py --autoprueba
  python research/torneo/torneo.py [--rapido] [--salida data/torneo] [--predicciones DIR]
"""
import argparse, bisect, csv, datetime as dt, json, math, sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
QS = (0.10, 0.25, 0.50, 0.75, 0.90)
HS = (1, 5, 21)
PERIODOS = {"practica": ("2021-01-01", "2024-12-31"), "examen_2025": ("2025-01-01", "2025-12-31"), "confirmacion_2026": ("2026-01-01", "9999-12-31")}
INICIO_PREDICCION = "2018-01-01"   # desde aquí predicen los modelos que aprenden (calentamiento hasta 2021)
VENTANA, MIN_K, PRIMERA_FILA = 756, 250, 300
VENTANA_BETA, MIN_BETA, MEDIA_BRECHA, MIN_BRECHA = 1500, 250, 60, 20
PROGRAMADOS = ("fomc", "bcrp_tasa", "elecciones_pe_1v", "elecciones_pe_2v")
TEMAS_CORPUS = ("pe_dolar", "pe_bcrp", "pe_politica", "pe_conflicto", "pe_elecciones", "pe_incert",
                "mu_fed", "mu_aranceles", "mu_recesion", "mu_dolar", "mu_guerra", "mu_incert")
CRUZ = ("PEN", "COBRE", "ORO", "WTI")
REJILLA = [
    dict(num_leaves=4, min_data_in_leaf=60, n_estimators=150, learning_rate=0.05),
    dict(num_leaves=8, min_data_in_leaf=40, n_estimators=300, learning_rate=0.05),
    dict(num_leaves=4, min_data_in_leaf=100, n_estimators=400, learning_rate=0.03),
    dict(num_leaves=16, min_data_in_leaf=80, n_estimators=200, learning_rate=0.05),
]
FIJOS = dict(bagging_fraction=0.8, bagging_freq=1, feature_fraction=0.8, lambda_l2=1.0, seed=7, num_threads=1, verbose=-1)

try:
    import lightgbm as lgb
except ImportError:  # sin LightGBM solo corren los motores clásicos
    lgb = None


# ---------- datos ----------
def cargar():
    d = json.load(open(RAIZ / "data/official/bcrp-daily.json", encoding="utf-8"))
    series = {k: [(f, float(v)) for f, v in s["serie"] if v is not None and float(v) > 0] for k, s in d["series"].items()}
    tono = sorted((f, float(v)) for f, v in json.load(open(RAIZ / "data/official/gdelt-daily.json", encoding="utf-8"))["series"]["pe_tono_diario"] if v is not None)
    eventos = {t: [] for t in PROGRAMADOS}
    with open(RAIZ / "data/v7/eventos/eventos.csv", encoding="utf-8") as fh:
        for fila in csv.DictReader(fh):
            if fila["tipo"] in eventos:
                eventos[fila["tipo"]].append(fila["fecha"])
    corpus = []
    ruta = RAIZ / "data/torneo/noticias-rasgos.csv"
    if ruta.exists():
        with open(ruta, encoding="utf-8") as fh:
            corpus = list(csv.DictReader(fh))
    interv = sorted((f, float(v)) for f, v in json.load(open(RAIZ / "data/official/bcrp-contexto.json", encoding="utf-8"))["series"]["INTERVENCION_BCRP"]["serie"] if v is not None)
    cierre = json.load(open(RAIZ / "data/official/bcrp-contexto.json", encoding="utf-8")).get("series", {}).get("TC_CIERRE_VENTA", {}).get("serie", [])
    cierre = [[f, float(v)] for f, v in cierre if v is not None and float(v) > 0]
    return series, tono, {t: sorted(v) for t, v in eventos.items()}, corpus, interv, cierre


def ordinal(f):
    return dt.date.fromisoformat(f).toordinal()


def ewma(u, lam):
    s2 = np.empty(len(u)); s2[0] = max(1e-10, float(np.mean(u[1:31] ** 2)))
    for i in range(1, len(u)):
        s2[i] = lam * s2[i - 1] + (1 - lam) * u[i] ** 2
    return np.sqrt(np.maximum(s2, 1e-10))


def media_movil(x, k):
    """Media de los últimos k valores (incluye el actual); NaN mientras no haya k."""
    c = np.cumsum(np.insert(x, 0, 0.0)); out = np.full(len(x), np.nan)
    out[k - 1:] = (c[k:] - c[:-k]) / k
    return out


def variables(fechas, lp, h, tono, eventos, corpus):
    """Devuelve (nombres, matriz, grupos). La fila i solo usa información conocida al cierre del día i."""
    n = len(lp); u = np.zeros(n); u[1:] = np.diff(lp)
    cols = {}
    cols["lv94"] = np.log(ewma(u, 0.94)); cols["lv97"] = np.log(ewma(u, 0.97))
    for k in (5, 21, 63):
        cols[f"rv{k}"] = 0.5 * np.log(np.maximum(media_movil(u ** 2, k), 1e-12))
    cols["abs0"] = np.abs(u); cols["abs1"] = np.concatenate([[np.nan], np.abs(u[:-1])])
    for k in (5, 21):
        r = np.full(n, np.nan); r[k:] = lp[k:] - lp[:-k]; cols[f"ret{k}"] = r
    base = list(cols)
    # calendario anunciado con antelación: cuántas citas caen dentro del horizonte
    ords = np.array([ordinal(f) for f in fechas]); alcance = math.ceil(h * 7 / 5) + 1
    for tipo in ("fomc", "bcrp_tasa"):
        ev = [ordinal(f) for f in eventos[tipo]]
        cols[f"cal_{tipo}"] = np.array([bisect.bisect_right(ev, o + alcance) - bisect.bisect_right(ev, o) for o in ords], dtype=float)
    ev = sorted(ordinal(f) for t in ("elecciones_pe_1v", "elecciones_pe_2v") for f in eventos[t])
    cols["cal_eleccion"] = np.array([bisect.bisect_right(ev, o + 30) - bisect.bisect_left(ev, o - 10) for o in ords], dtype=float)
    cal = [c for c in cols if c.startswith("cal_")]
    # noticias: tono de la prensa peruana, solo de días anteriores al corte
    tf = [f for f, _ in tono]; tv = np.array([v for _, v in tono]); to = [ordinal(f) for f in tf]
    nombres_not = ("not_tono", "not_m5", "not_m21", "not_giro", "not_z60", "not_sd21", "not_salto")
    for c in nombres_not:
        cols[c] = np.full(n, np.nan)
    for i, f in enumerate(fechas):
        j = bisect.bisect_left(tf, f)          # tv[:j] son días estrictamente anteriores
        if j < 60 or ords[i] - to[j - 1] > 5:
            continue
        m5, m21, v60 = tv[j - 5:j].mean(), tv[j - 21:j].mean(), tv[j - 60:j]
        cols["not_tono"][i] = tv[j - 1]; cols["not_m5"][i] = m5; cols["not_m21"][i] = m21; cols["not_giro"][i] = m5 - m21
        cols["not_z60"][i] = (m5 - v60.mean()) / max(v60.std(), 1e-6); cols["not_sd21"][i] = tv[j - 21:j].std(); cols["not_salto"][i] = abs(tv[j - 1] - tv[j - 2])
    # corpus de noticias: parte de cada tema por día y su z frente a las 60 filas anteriores
    nombres_corpus = [f"c_{t}_z" for t in TEMAS_CORPUS] + ["c_calor"]
    for c in nombres_corpus:
        cols[c] = np.full(n, np.nan)
    if corpus:
        dias = [f["dia"] for f in corpus]; ordd = [ordinal(d) for d in dias]
        part = np.full((len(corpus), len(TEMAS_CORPUS)), np.nan)
        for k, f in enumerate(corpus):
            for c, t in enumerate(TEMAS_CORPUS):
                tot = float(f["pe_total"] if t.startswith("pe_") else f["mu_total"])
                if tot > 0:
                    part[k, c] = float(f[t]) / tot
        for i, f in enumerate(fechas):
            o = ords[i]; j = bisect.bisect_right(ordd, o + 1) - 1   # hasta el día siguiente al corte (05:00 de Lima)
            if j < 62 or (o + 1) - ordd[j] > 3 or ordd[j] - ordd[j - 62] > 80:
                continue
            rec, ant = part[j - 2:j + 1], part[j - 62:j - 2]
            if not (np.isfinite(rec).all() and np.isfinite(ant).all()):
                continue
            sd = ant.std(axis=0); z = np.where(sd > 1e-12, (rec.mean(axis=0) - ant.mean(axis=0)) / np.maximum(sd, 1e-12), 0.0)
            z = np.clip(z, -8, 8)
            for c, v in enumerate(z):
                cols[nombres_corpus[c]][i] = v
            cols["c_calor"][i] = z.mean()
    nombres = list(cols)
    return nombres, np.column_stack([cols[c] for c in nombres]), {"base": base, "cal": cal, "not": list(nombres_not), "corpus": nombres_corpus}


def cruzadas(fechas, activo, series, interv):
    """Otros mercados y BCRP. Devuelve (nombres, matriz). La fila i solo usa datos con fecha <= fechas[i]."""
    n = len(fechas); cols = {}
    for S in CRUZ:
        if S == activo:
            continue
        fS = [f for f, _ in series[S]]; lpS = np.log(np.array([v for _, v in series[S]]))
        uS = np.zeros(len(lpS)); uS[1:] = np.diff(lpS); sS = ewma(uS, 0.94)
        a, b, c = (np.full(n, np.nan) for _ in range(3))
        for i, f in enumerate(fechas):
            k = bisect.bisect_right(fS, f) - 1
            if k < 30 or ordinal(f) - ordinal(fS[k]) > 5:
                continue
            a[i], b[i], c[i] = math.log(sS[k]), abs(uS[k]), lpS[k] - lpS[k - 5]
        cols[f"x_{S}_lv94"], cols[f"x_{S}_abs1"], cols[f"x_{S}_ret5"] = a, b, c
    fi = [f for f, _ in interv]; vi = np.abs(np.array([v for _, v in interv]))
    a, b, c = (np.full(n, np.nan) for _ in range(3))
    for i, f in enumerate(fechas):
        k = bisect.bisect_right(fi, f) - 1
        if k < 20 or ordinal(f) - ordinal(fi[k]) > 5:
            continue
        a[i], b[i], c[i] = vi[k], vi[k - 4:k + 1].sum(), vi[k - 20:k + 1].sum()
    cols["x_int_hoy"], cols["x_int_5"], cols["x_int_21"] = a, b, c
    nombres = list(cols)
    return nombres, np.column_stack([cols[c] for c in nombres])


# ---------- motores clásicos ----------
def cuantiles(a):
    return np.quantile(a, QS, method="inverted_cdf")


def clasicos(lp, h, i0):
    """caminata, motor_actual (FHS λ=0,94) y fhs97_k (FHS λ=0,97 con ajuste de ancho aprendido sin trampa)."""
    n = len(lp); u = np.zeros(n); u[1:] = np.diff(lp)
    rh = np.full(n, np.nan); rh[h:] = lp[h:] - lp[:-h]
    s94, s97 = ewma(u, 0.94), ewma(u, 0.97)
    out = {k: np.full((n, 5), np.nan) for k in ("caminata", "motor_actual", "fhs97_k")}
    nec80, nec50 = np.full(n, np.nan), np.full(n, np.nan)
    for c in range(i0, n):
        w = slice(max(h, c - VENTANA), c + 1)
        out["caminata"][c] = cuantiles(rh[w])
        out["motor_actual"][c] = cuantiles(rh[w] * np.clip(s94[c] / s94[w], 0.2, 5.0))
        f = cuantiles(rh[w] * np.clip(s97[c] / s97[w], 0.2, 5.0))
        if c + h < n:   # cuánto habría que estirar la banda para acertar (se conoce recién en c+h)
            y = lp[c + h] - lp[c]
            nec80[c] = (y / f[4] if f[4] > 0 else 1.0) if y >= 0 else (y / f[0] if f[0] < 0 else 1.0)
            nec50[c] = (y / f[3] if f[3] > 0 else 1.0) if y >= 0 else (y / f[1] if f[1] < 0 else 1.0)
        previos = slice(i0, c - h + 1)   # cortes cuyo resultado ya se conoce en c
        k80 = k50 = 1.0
        if c - h + 1 - i0 >= MIN_K:
            k80, k50 = float(np.quantile(nec80[previos], 0.80, method="inverted_cdf")), float(np.quantile(nec50[previos], 0.50, method="inverted_cdf"))
        g = np.array([k80 * f[0], k50 * f[1], f[2], k50 * f[3], k80 * f[4]])
        g[1], g[3] = max(g[1], g[0]), min(g[3], g[4])
        out["fhs97_k"][c] = np.sort(g)
    return out


def brecha_cierre(fechas, lp, cierre):
    """Brecha del corte c = log(cierre 13:30 venta de ese día) - log(SBS venta de ese día), menos su media de los 60 cortes previos.
    NaN si ese día no tiene cierre o hay menos de 20 brechas previas. Solo usa datos de fechas <= fechas[c]."""
    por_dia = dict(cierre); n = len(lp)
    g = np.array([np.log(por_dia[f]) - lp[i] if por_dia.get(f) else np.nan for i, f in enumerate(fechas)])
    gc = np.full(n, np.nan)
    for c in range(n):
        prev = g[max(0, c - MEDIA_BRECHA):c]; prev = prev[np.isfinite(prev)]
        if np.isfinite(g[c]) and len(prev) >= MIN_BRECHA:
            gc[c] = g[c] - prev.mean()
    return gc


def cierre_ayer(lp, gc, Qref, s94, h, i0):
    """Rango del motor actual movido hacia donde cerró el mercado: centro = beta * brecha del corte; ancho con los errores de ese centro.
    beta se estima solo con cortes cuyo resultado ya se conoce en c (j + h <= c). Sin brecha en el corte: fila del motor actual."""
    n = len(lp); y = np.full(n, np.nan); y[:n - h] = lp[h:] - lp[:n - h]
    out = Qref.copy(); w2 = 1.0 / np.maximum(s94, 1e-9) ** 2
    for c in range(max(i0, h), n):
        if not np.isfinite(gc[c]) or not np.isfinite(Qref[c, 0]):
            continue
        j = np.arange(max(h, c - VENTANA_BETA), c - h + 1); j = j[np.isfinite(gc[j])]
        if len(j) < MIN_BETA:
            continue
        beta = float(np.sum(w2[j] * gc[j] * y[j]) / np.sum(w2[j] * gc[j] ** 2))
        k = np.arange(max(h, c - VENTANA), c - h + 1)
        e = y[k] - beta * np.where(np.isfinite(gc[k]), gc[k], 0.0)
        out[c] = beta * gc[c] + cuantiles(e * np.clip(s94[c] / s94[k], 0.2, 5.0))
    return out


# ---------- motores que aprenden ----------
def aprender(X, t, h, a0, a1, cadencia, params, alfas):
    """Predice los cortes [a0, a1). Reentrena cada `cadencia` cortes con filas cuyo objetivo ya se conocía."""
    out = np.full((len(t), len(alfas)), np.nan)
    for a in range(a0, a1, cadencia):
        filas = np.arange(PRIMERA_FILA, a - h + 1); filas = filas[np.isfinite(t[filas])]
        if len(filas) < 500:
            continue
        b = min(a1, a + cadencia)
        for k, alfa in enumerate(alfas):
            ajustes = {k_: v for k_, v in params.items() if k_ != "n_estimators"}
            m = lgb.train(dict(objective="regression" if alfa is None else "quantile", alpha=alfa or 0.5, **ajustes, **FIJOS),
                          lgb.Dataset(X[filas], t[filas]), num_boost_round=params["n_estimators"])
            out[a:b, k] = m.predict(X[a:b])
    return out


def bandas_vol(pred, y, h, i0):
    """Convierte una volatilidad prevista en bandas con los errores pasados del propio modelo."""
    n = len(y); z = y / np.exp(pred); out = np.full((n, 5), np.nan)
    for c in range(i0, n):
        pasado = z[max(i0, c - h - VENTANA):c - h + 1]; pasado = pasado[np.isfinite(pasado)]
        if len(pasado) >= MIN_K and np.isfinite(pred[c]):
            out[c] = math.exp(pred[c]) * cuantiles(pasado)
    return out


def pinball(Q, y):
    return np.mean([np.maximum(q * (y - Q[:, k]), (q - 1) * (y - Q[:, k])) for k, q in enumerate(QS)], axis=0)


def metricas(Q, y, idx):
    idx = idx[np.isfinite(Q[idx, 0]) & np.isfinite(y[idx])]
    if len(idx) < 30:
        return None
    q, r = Q[idx], y[idx]
    return {"n": int(len(idx)), "pinball": float(pinball(q, r).mean() * 100),
            "score80": float(np.mean((q[:, 4] - q[:, 0]) + 10 * np.maximum(0, q[:, 0] - r) + 10 * np.maximum(0, r - q[:, 4])) * 100),
            "cobertura80": float(np.mean((r >= q[:, 0]) & (r <= q[:, 4])) * 100), "cobertura50": float(np.mean((r >= q[:, 1]) & (r <= q[:, 3])) * 100),
            "ancho80": float(np.median(q[:, 4] - q[:, 0]) * 100), "ancho50": float(np.median(q[:, 3] - q[:, 1]) * 100)}


def duelo(Qa, Qb, y, idx, h):
    """Compara a contra b en los mismos días. Devuelve razón de pinball (a/b) y p de Diebold-Mariano."""
    idx = idx[np.isfinite(Qa[idx, 0]) & np.isfinite(Qb[idx, 0]) & np.isfinite(y[idx])]
    if len(idx) < 30:
        return None
    la, lb = pinball(Qa[idx], y[idx]), pinball(Qb[idx], y[idx]); d = la - lb; n = len(d); dm = d - d.mean()
    var = float(np.mean(dm ** 2))
    for k in range(1, h):
        var += 2 * (1 - k / h) * float(np.mean(dm[k:] * dm[:-k]))
    p = math.erfc(abs(d.mean()) / math.sqrt(max(var, 1e-18) / n) / math.sqrt(2)) if var > 0 else 1.0
    return {"n": int(n), "razon": float(la.mean() / lb.mean()), "p": float(p)}


def analogos(Z, y, escala, Qref, h, i0, beta):
    """Días parecidos: ensancha o afina el rango del motor actual según cómo le fue en los días con noticias parecidas."""
    n = len(y); salida = Qref.copy(); r = np.abs(y) / escala
    for i in range(i0, n):
        if not np.isfinite(Z[i]).all() or not np.isfinite(Qref[i, 0]):
            continue
        js = np.array([j for j in range(0, i - h + 1) if np.isfinite(Z[j]).all() and np.isfinite(r[j])], dtype=int)
        if len(js) < 120:
            continue
        d = np.sqrt(((Z[js] - Z[i]) ** 2).sum(axis=1)); cerca = js[np.argsort(d, kind="stable")[:25]]
        k = float(np.clip(r[cerca].mean() / r[js].mean(), 0.7, 1.5)) ** beta
        salida[i] = Qref[i, 2] + (Qref[i] - Qref[i, 2]) * k
    return salida


def correr_activo(args):
    activo, series, tono, eventos, corpus, interv, cierre, rapido = args
    serie = series[activo]
    fechas = [f for f, _ in serie]; lp = np.log(np.array([v for _, v in serie])); n = len(lp)
    i0 = bisect.bisect_left(fechas, INICIO_PREDICCION); i25 = bisect.bisect_left(fechas, PERIODOS["examen_2025"][0])
    cortes = {p: np.arange(bisect.bisect_left(fechas, a), bisect.bisect_right(fechas, b)) for p, (a, b) in PERIODOS.items()}
    salida, filas_pred = {}, []
    for h in ((5,) if rapido else HS):
        y = np.full(n, np.nan); y[:n - h] = lp[h:] - lp[:n - h]
        Q = clasicos(lp, h, i0 - VENTANA)
        if activo == "PEN" and cierre:
            u1 = np.zeros(n); u1[1:] = np.diff(lp)
            Q["cierre_ayer"] = cierre_ayer(lp, brecha_cierre(fechas, lp, cierre), Q["motor_actual"], ewma(u1, 0.94), h, i0 - VENTANA)
        elegidos = {}
        nombres, X, grupos = variables(fechas, lp, h, tono, eventos, corpus)
        nx, Xx = cruzadas(fechas, activo, series, interv)
        X = np.column_stack([X, Xx]); nombres += nx; grupos["cruz"] = nx
        u = np.zeros(n); u[1:] = np.diff(lp); cs = np.cumsum(np.insert(u ** 2, 0, 0.0))
        rvh = np.full(n, np.nan); rvh[:n - h] = np.sqrt(cs[h + 1:] - cs[1:n - h + 1])
        t_vol = np.log(rvh + 1e-4)
        escala = np.exp(X[:, nombres.index("lv97")]) * math.sqrt(h); t_q = y / escala
        # motor de días parecidos: ajusta el rango del motor actual con los 25 días de noticias más parecidas
        cols_z = [nombres.index(f"c_{t}_z") for t in TEMAS_CORPUS]
        Z = X[:, cols_z]
        if np.isfinite(Z[:, 0]).any():
            Qref = Q["motor_actual"]; mejor = None
            for beta in (0.5, 1.0):   # el beta se elige solo con la práctica
                q = analogos(Z, y, escala, Qref, h, i0, beta)
                m = metricas(q, y, cortes["practica"])
                if m and (mejor is None or m["pinball"] < mejor[0]):
                    mejor = (m["pinball"], beta, q)
            if mejor is not None:
                Q["analogos"] = mejor[2]; elegidos["analogos"] = {"beta": mejor[1]}
        if lgb is not None:
            col = lambda gs: [nombres.index(c) for g in gs for c in grupos[g]]
            planes = [("aprende_vol", ("base",), t_vol, (None,)), ("aprende_vol_cal", ("base", "cal"), t_vol, (None,)), ("aprende_vol_noticias", ("base", "cal", "not"), t_vol, (None,)),
                      ("aprende_vol_corpus", ("base", "cal", "corpus"), t_vol, (None,)), ("aprende_vol_cruz", ("base", "cal", "cruz"), t_vol, (None,)),
                      ("aprende_rango_cal", ("base", "cal"), t_q, QS), ("aprende_rango_noticias", ("base", "cal", "not"), t_q, QS)]
            for nombre, gs, t, alfas in planes:
                Xc = X[:, col(gs)]; mejor = None
                def a_bandas(pred):
                    return bandas_vol(pred[:, 0], y, h, i0) if alfas == (None,) else np.sort(pred, axis=1) * escala[:, None]
                for params in (REJILLA[:1] if rapido else REJILLA):   # ajustes elegidos solo con la práctica
                    pred = aprender(Xc, t, h, i0, i25, 63, params, alfas)
                    m = metricas(a_bandas(pred), y, cortes["practica"])
                    if m and (mejor is None or m["pinball"] < mejor[0]):
                        mejor = (m["pinball"], params, pred)
                if mejor is None:
                    continue
                pred = mejor[2]; nuevo = aprender(Xc, t, h, i25, n, 21, mejor[1], alfas); pred[i25:] = nuevo[i25:]
                Q[nombre] = a_bandas(pred); elegidos[nombre] = mejor[1]
            if "aprende_vol_cal" in Q:
                Q["mezcla"] = (Q["motor_actual"] + Q["aprende_vol_cal"]) / 2
        res = {}
        for nombre, q in Q.items():
            res[nombre] = {p: metricas(q, y, idx) for p, idx in cortes.items()}
            for ref in ("caminata", "motor_actual"):
                if nombre != ref:
                    res[nombre][f"contra_{ref}"] = {p: duelo(q, Q[ref], y, idx, h) for p, idx in cortes.items()}
            if nombre in elegidos:
                res[nombre]["ajustes"] = elegidos[nombre]
        efecto = {}
        for con, sin in (("aprende_vol_noticias", "aprende_vol_cal"), ("aprende_rango_noticias", "aprende_rango_cal"),
                         ("aprende_vol_corpus", "aprende_vol_cal"), ("aprende_vol_cruz", "aprende_vol_cal"), ("analogos", "motor_actual")):
            if con in Q and sin in Q:
                efecto[con] = {}
                for p, idx in cortes.items():
                    d = duelo(Q[con], Q[sin], y, idx, h); ok = idx[np.isfinite(Q[con][idx, 0]) & np.isfinite(Q[sin][idx, 0])]
                    if d and len(ok):
                        cambio = np.abs((Q[con][ok, 4] - Q[con][ok, 0]) / np.maximum(Q[sin][ok, 4] - Q[sin][ok, 0], 1e-9) - 1) * 100
                        d.update(cambio_ancho_mediano_pct=float(np.median(cambio)), cambio_ancho_p90_pct=float(np.quantile(cambio, 0.9)))
                    efecto[con][p] = d
        con_corpus = np.isfinite(Z[:, 0])
        salida[f"h{h}"] = {"motores": res, "efecto_noticias": efecto,
                           "dias_con_corpus": {p: int(con_corpus[idx].sum()) for p, idx in cortes.items()}}
        for nombre, q in Q.items():
            for c in range(i25, n):
                if np.isfinite(q[c, 0]):
                    filas_pred.append([activo, h, nombre, fechas[c]] + [round(float(v), 6) for v in q[c]] + [round(float(y[c]), 6) if np.isfinite(y[c]) else ""])
    return activo, fechas[-1], salida, filas_pred


# ---------- veredicto e informe ----------
def veredicto(m):
    """gana / empata / pierde frente a los dos motores de referencia, con el examen 2025."""
    ex, c1, c2 = m.get("examen_2025"), (m.get("contra_caminata") or {}).get("examen_2025"), (m.get("contra_motor_actual") or {}).get("examen_2025")
    if not ex or not c1 or not c2:
        return None
    calibrado = 74 <= ex["cobertura80"] <= 86
    if c1["razon"] < 0.99 and c2["razon"] < 0.99 and c1["p"] < 0.05 and c2["p"] < 0.05 and calibrado:
        return "gana"
    if c1["razon"] > 1.01 and c2["razon"] > 1.01 and (c1["p"] < 0.05 or c2["p"] < 0.05):
        return "pierde"
    return "empata"


def informe(marcador):
    f = lambda v, d=2: "—" if v is None else f"{v:.{d}f}"
    L = ["# Torneo del motor — ronda 2", "", f"Actualizado {marcador['actualizado']} · último dato {marcador['ultimo_dato']}", "",
         "Práctica 2021-2024 (ahí se eligen ajustes), examen 2025 (ajustes congelados), confirmación 2026 (no se usa para elegir).",
         "Pinball: error del rango, menor es mejor. Razón < 1 = mejor que la referencia. p < 0,05 = la diferencia no parece azar.", ""]
    for activo, hs in marcador["activos"].items():
        for h, bloque in hs.items():
            L += [f"## {activo} · {h[1:]} días hábiles", "", "| motor | pinball 2025 | cobertura 80 % | ancho 80 % | vs caminata (p) | vs motor actual (p) | pinball 2026 | cobertura 2026 | veredicto |", "|---|---|---|---|---|---|---|---|---|"]
            for nombre, m in bloque["motores"].items():
                ex, co = m.get("examen_2025") or {}, m.get("confirmacion_2026") or {}
                c1, c2 = (m.get("contra_caminata") or {}).get("examen_2025"), (m.get("contra_motor_actual") or {}).get("examen_2025")
                d = lambda c: "—" if not c else f"{c['razon']:.3f} ({c['p']:.2f})"
                L.append(f"| {nombre} | {f(ex.get('pinball'), 4)} | {f(ex.get('cobertura80'), 1)} | {f(ex.get('ancho80'))} | {d(c1)} | {d(c2)} | {f(co.get('pinball'), 4)} | {f(co.get('cobertura80'), 1)} | {m.get('veredicto') or '—'} |")
            if "cierre_ayer" in bloque["motores"]:
                L.append("- `cierre_ayer` necesita el tipo de cambio de cierre de la 1:30 p. m. del día del corte (BCRP, PD04646PD), que el BCRP publica con retraso.")
            L.append("")
            dcc = bloque.get("dias_con_corpus") or {}
            L.append(f"- Días con noticias del corpus: práctica {dcc.get('practica', 0)}, examen 2025 {dcc.get('examen_2025', 0)}, confirmación 2026 {dcc.get('confirmacion_2026', 0)}.")
            for con, per in bloque["efecto_noticias"].items():
                for p in ("examen_2025", "confirmacion_2026"):
                    e = per.get(p)
                    if e:
                        L.append(f"- Noticias en `{con}` ({p}): razón {e['razon']:.3f} frente al mismo motor sin noticias (p {e['p']:.2f}); el ancho del rango cambia {e.get('cambio_ancho_mediano_pct', 0):.1f} % en un día típico y {e.get('cambio_ancho_p90_pct', 0):.1f} % en los días de más noticias.")
            L.append("")
    return "\n".join(L) + "\n"


def autoprueba():
    """Si se borra el futuro, la predicción y las variables de un corte no deben cambiar."""
    series, tono, eventos, corpus, interv, cierre = cargar(); serie = series["PEN"]; fechas = [f for f, _ in serie]; lp = np.log(np.array([v for _, v in serie]))
    c = bisect.bisect_left(fechas, "2025-03-03"); i0 = bisect.bisect_left(fechas, INICIO_PREDICCION)
    rec = {k: [x for x in v if x[0] <= fechas[c]] for k, v in series.items()}
    interv2 = [x for x in interv if x[0] <= fechas[c]]
    _, Xc = cruzadas(fechas, "PEN", series, interv)
    _, Xc2 = cruzadas(fechas[:c + 1], "PEN", rec, interv2)
    assert np.allclose(Xc[c], Xc2[c], equal_nan=True), "cruzadas con fuga"
    assert np.isfinite(Xc[c]).all(), "cruzadas vacías en el corte de prueba"
    sig = (dt.date.fromisoformat(fechas[c]) + dt.timedelta(days=1)).isoformat()   # el corpus llega hasta el día siguiente al corte
    tono2 = [x for x in tono if x[0] < fechas[c]]; corpus2 = [f for f in corpus if f["dia"] <= sig]
    for h in HS:
        nombres, Xa, _ = variables(fechas, lp, h, tono, eventos, corpus)
        _, Xb, _ = variables(fechas[:c + 1], lp[:c + 1], h, tono2, eventos, corpus2)
        assert np.allclose(Xa[c], Xb[c], equal_nan=True), f"variables con fuga h={h}"
        assert np.isfinite(Xa[c]).all(), "variables vacías en el corte de prueba"
        if corpus:   # las 13 columnas del corpus son finitas en el corte de prueba
            cols_corpus = [f"c_{t}_z" for t in TEMAS_CORPUS] + ["c_calor"]
            assert np.isfinite(Xa[c, [nombres.index(x) for x in cols_corpus]]).all(), "corpus vacío en el corte de prueba"
        qa, qb = clasicos(lp, h, i0 - VENTANA), clasicos(lp[:c + 1], h, i0 - VENTANA)
        for k in qa:
            assert np.allclose(qa[k][c], qb[k][c]), f"{k} con fuga h={h}"
            assert (np.diff(qa[k][c]) >= 0).all(), f"{k} cuantiles desordenados"
        if cierre:
            cierre_c = [x for x in cierre if x[0] <= fechas[c]]
            u = np.zeros(len(lp)); u[1:] = np.diff(lp); s94 = ewma(u, 0.94)
            g = brecha_cierre(fechas, lp, cierre)
            g2 = brecha_cierre(fechas[:c + 1], lp[:c + 1], cierre_c)
            assert np.allclose(g[:c + 1], g2, equal_nan=True), f"brecha_cierre con fuga h={h}"
            assert np.isfinite(g[c]), "brecha del corte de prueba vacía"
            q = cierre_ayer(lp, g, qa["motor_actual"], s94, h, i0 - VENTANA)
            q2 = cierre_ayer(lp[:c + 1], g2, qb["motor_actual"][:c + 1], s94[:c + 1], h, i0 - VENTANA)
            assert np.allclose(q[c], q2[c]), f"cierre_ayer con fuga h={h}"
    for h in (1, 5, 21):   # analogos sin fuga: recortado a [:c+1] con el y recalculado da la misma fila c
        y = np.full(len(lp), np.nan); y[:len(lp) - h] = lp[h:] - lp[:len(lp) - h]
        lp2 = lp[:c + 1]; y2 = np.full(c + 1, np.nan); y2[:c + 1 - h] = lp2[h:] - lp2[:c + 1 - h]
        nombres, X, _ = variables(fechas, lp, h, tono, eventos, corpus)
        _, X2, _ = variables(fechas[:c + 1], lp2, h, tono2, eventos, corpus2)
        Z = X[:, [nombres.index(f"c_{t}_z") for t in TEMAS_CORPUS]]
        Z2 = X2[:, [nombres.index(f"c_{t}_z") for t in TEMAS_CORPUS]]
        escala = np.exp(X[:, nombres.index("lv97")]) * math.sqrt(h)
        escala2 = np.exp(X2[:, nombres.index("lv97")]) * math.sqrt(h)
        Qref, Qref2 = clasicos(lp, h, i0 - VENTANA)["motor_actual"], clasicos(lp2, h, i0 - VENTANA)["motor_actual"]
        for beta in (0.5, 1.0):
            qa = analogos(Z, y, escala, Qref, h, i0, beta)
            qb = analogos(Z2, y2, escala2, Qref2, h, i0, beta)
            assert np.allclose(qa[c], qb[c], equal_nan=True), f"analogos con fuga beta={beta} h={h}"
    y = np.array([0.0, 0.01, -0.02]); Q = np.tile(np.array([-0.01, -0.005, 0.0, 0.005, 0.01]), (3, 1))
    assert abs(pinball(Q, y)[0] - np.mean([0.1 * 0.01, 0.25 * 0.005, 0, 0.25 * 0.005, 0.1 * 0.01])) < 1e-12
    print("autoprueba: sin fuga de información, cuantiles en orden, pinball correcto, corpus sin fuga, otros mercados sin fuga, cierre de ayer sin fuga")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--rapido", action="store_true"); ap.add_argument("--autoprueba", action="store_true")
    ap.add_argument("--salida", default=str(RAIZ / "data/torneo")); ap.add_argument("--predicciones"); a = ap.parse_args()
    if a.autoprueba:
        return autoprueba()
    series, tono, eventos, corpus, interv, cierre = cargar()
    activos = ["PEN"] if a.rapido else list(series)
    with Pool(min(4, len(activos))) as pool:
        resultados = pool.map(correr_activo, [(k, series, tono, eventos, corpus, interv, cierre, a.rapido) for k in activos])
    marcador = {"actualizado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "ultimo_dato": max(r[1] for r in resultados),
                "protocolo": "practica 2021-2024, examen 2025, confirmacion 2026", "con_aprendizaje": lgb is not None, "rapido": a.rapido, "activos": {}}
    for activo, _, salida, _ in resultados:
        for bloque in salida.values():
            for nombre, m in bloque["motores"].items():
                if nombre not in ("caminata", "motor_actual"):
                    m["veredicto"] = veredicto(m)
        marcador["activos"][activo] = salida
    out = Path(a.salida); out.mkdir(parents=True, exist_ok=True)
    (out / "marcador.json").write_text(json.dumps(marcador, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "informe.md").write_text(informe(marcador), encoding="utf-8")
    if a.predicciones:
        Path(a.predicciones).mkdir(parents=True, exist_ok=True)
        with open(Path(a.predicciones) / "predicciones.csv", "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh); w.writerow(["activo", "h", "motor", "corte", "p10", "p25", "p50", "p75", "p90", "real"])
            for r in resultados:
                w.writerows(r[3])
    print(informe(marcador))


if __name__ == "__main__":
    sys.exit(main())
