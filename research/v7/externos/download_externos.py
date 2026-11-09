#!/usr/bin/env python3
"""V7 externos: public external series that move the USD/PEN sol.

Downloads daily (and one monthly) public series from FRED via the
fredgraph.csv endpoint (no API key) into ~/v7/data/externos/<ID>.csv
with header `fecha,valor,fecha_disponible` per CONVENCIONES, plus
~/v7/data/externos/_indice.csv and ~/v7/data/externos/_licencias.md.
`fecha_disponible` is the next business day after `fecha` for daily
observations; for the monthly copper series it is the first of the
following month (the monthly average is not known until the month
closes; this is conservative, akin to the 45-day BCRP lag).

Resumable: each series CSV is written atomically (<id>.csv.tmp ->
<id>.csv); a series whose CSV already exists and covers the current
end date is skipped unless --only forces it. Polite pacing (~1 s
between requests), exponential retries, progress log
~/v7/logs/externos.log. Runs detached (setsid nohup); a small --probe
mode checks only a recent slice per series (~a minute).

Licences: checked 2026-11-09 on each FRED series page and on the
FRED legal page. Two rows carry a third-party copyright notice and
are flagged "hay que revisar" (VIXCLS - CBOE; PCOPPUSDM - IMF);
BAMLC0A0CM (ICE BofA) is "pre-approval required" and, with only
~3 years of history, is not downloaded — it stays documented as an
exclusion in _licencias.md. Federal-Reserve H.10/H.15 series are
public domain (citation requested). The U.S. Treasury complement
(direct treasury.gov par-yield download as public-domain
alternative to the Fed H.15 republishing) is documented but not
fetched: the site serves a JavaScript-rendered page with no stable
CSV endpoint, while FRED already republishes the same Treasury
curve methodology. See README.md.

Usage:
    ~/v7-env/bin/python research/v7/externos/download_externos.py --probe
    ~/v7-env/bin/python research/v7/externos/download_externos.py
    ~/v7-env/bin/python research/v7/externos/download_externos.py --only DTWEXBGS,DGS10

Environment:
    EXTERNOS_DATA_DIR=/home/wagustin/v7/data/externos (default)
    EXTERNOS_LOG=/home/wagustin/v7/logs/externos.log   (default)
"""
import argparse
import csv
import datetime as dt
import os
import sys
import time
import urllib.error
import urllib.request

UA = "PerDataBot/1.0 (+https://perdata.site)"
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}"
FRED_PAGE = "https://fred.stlouisfed.org/series/{sid}"
DATA_DIR = os.environ.get("EXTERNOS_DATA_DIR", "/home/wagustin/v7/data/externos")
PROGRESS_LOG = os.environ.get("EXTERNOS_LOG", "/home/wagustin/v7/logs/externos.log")
SLEEP_S = 1  # FRED graph endpoint is tolerant, but stay polite.
END = dt.date.today().isoformat()
START_YEAR = 2005  # brief asks "desde 2005 (o desde que existan)"

# id, name (as on the FRED page), unit (as on the FRED page),
# frequency, availability lag in calendar days for disponible calc.
# Daily: disponible = next business day (special-cased in
# next_business_day); monthly: lag = days to the 1st of next month
# is computed by monthly_disponible, so lag here is unused for it.
SERIES = [
    ("DTWEXBGS", "Nominal Broad U.S. Dollar Index", "Index Jan 2006=100", "diaria"),
    ("DGS10", "Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity, Quoted on an Investment Basis", "Percent", "diaria"),
    ("DGS2", "Market Yield on U.S. Treasury Securities at 2-Year Constant Maturity, Quoted on an Investment Basis", "Percent", "diaria"),
    ("T10Y2Y", "10-Year Treasury Constant Maturity Minus 2-Year Treasury Constant Maturity", "Percent", "diaria"),
    ("DFF", "Effective Federal Funds Rate", "Percent", "diaria"),
    ("DGS1", "Market Yield on U.S. Treasury Securities at 1-Year Constant Maturity, Quoted on an Investment Basis", "Percent", "diaria"),
    ("DGS5", "Market Yield on U.S. Treasury Securities at 5-Year Constant Maturity, Quoted on an Investment Basis", "Percent", "diaria"),
    ("DGS7", "Market Yield on U.S. Treasury Securities at 7-Year Constant Maturity, Quoted on an Investment Basis", "Percent", "diaria"),
    ("DGS20", "Market Yield on U.S. Treasury Securities at 20-Year Constant Maturity, Quoted on an Investment Basis", "Percent", "diaria"),
    ("DGS30", "Market Yield on U.S. Treasury Securities at 30-Year Constant Maturity, Quoted on an Investment Basis", "Percent", "diaria"),
    ("DFII10", "Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity, Quoted on an Investment Basis, Inflation-Indexed", "Percent", "diaria"),
    ("T10YIE", "10-Year Breakeven Inflation Rate", "Percent", "diaria"),
    ("VIXCLS", "CBOE Volatility Index: VIX (Close)", "Index", "diaria"),
    ("DCOILWTICO", "Crude Oil Prices: WTI - Cushing, Oklahoma", "Dollars per Barrel", "diaria"),
    ("DCOILBRENTEU", "Crude Oil Prices: Brent - Europe", "Dollars per Barrel", "diaria"),
    ("DEXBZUS", "Brazilian Reals to U.S. Dollar Spot Exchange Rate", "Brazilian Reals to One U.S. Dollar", "diaria"),
    ("DEXMXUS", "Mexican Pesos to U.S. Dollar Spot Exchange Rate", "Mexican Pesos to One U.S. Dollar", "diaria"),
    ("DEXCAUS", "Canadian Dollars to U.S. Dollar Spot Exchange Rate", "Canadian Dollars to One U.S. Dollar", "diaria"),
    ("DEXCHUS", "Chinese Yuan Renminbi to U.S. Dollar Spot Exchange Rate", "Chinese Yuan Renminbi to One U.S. Dollar", "diaria"),
    ("DEXINUS", "Indian Rupees to U.S. Dollar Spot Exchange Rate", "Indian Rupees to One U.S. Dollar", "diaria"),
    ("DEXJPUS", "Japanese Yen to U.S. Dollar Spot Exchange Rate", "Japanese Yen to One U.S. Dollar", "diaria"),
    ("DEXUSUK", "U.S. Dollars to U.K. Pound Sterling Spot Exchange Rate", "U.S. Dollars to One U.K. Pound Sterling", "diaria"),
    ("DEXNOUS", "Norwegian Kroner to U.S. Dollar Spot Exchange Rate", "Norwegian Kroner to One U.S. Dollar", "diaria"),
    ("DEXUSNZ", "U.S. Dollars to New Zealand Dollar Spot Exchange Rate", "U.S. Dollars to One New Zealand Dollar", "diaria"),
    ("PCOPPUSDM", "Global Price of Copper", "U.S. Dollars per Metric Ton", "mensual"),
]

# id -> (source, FRED page licence label, commercial use, note)
LICENCES = {
    "DTWEXBGS": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Serie de la Fed; dominio público."),
    "DGS10": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Curva del Tesoro vía Fed H.15."),
    "DGS2": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Curva del Tesoro vía Fed H.15."),
    "T10Y2Y": ("Federal Reserve Bank of St. Louis, Release Interest Rate Spreads", "Copyrighted: Citation required", "si, con cita", "Spread derivado de BC_10YEAR y BC_2YEAR (Tesoro); cita requerida."),
    "DFF": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Tasa efectiva de fondos federales (Fed H.15)."),
    "DGS1": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Curva del Tesoro vía Fed H.15."),
    "DGS5": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Curva del Tesoro vía Fed H.15."),
    "DGS7": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Curva del Tesoro vía Fed H.15."),
    "DGS20": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Curva del Tesoro vía Fed H.15."),
    "DGS30": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Curva del Tesoro vía Fed H.15."),
    "DFII10": ("Board of Governors of the Federal Reserve System (US), Release H.15", "Public Domain: Citation requested", "si, con cita", "Tasa real TIPS 10 años (Fed H.15)."),
    "T10YIE": ("Federal Reserve Bank of St. Louis, Release Interest Rate Spreads", "Copyrighted: Citation required", "si, con cita", "Breakeven derivado de DGS10 y DFII10; cita requerida."),
    "VIXCLS": ("Chicago Board Options Exchange (CBOE), Release CBOE Market Statistics", "Copyrighted: Citation required (third party)", "hay que revisar", "Aviso de copyright de terceros en la página de la serie («Copyright, 2016, CBOE. Reprinted with permission»): permiso del CBOE antes de uso comercial en producción; ver _licencias.md."),
    "DCOILWTICO": ("U.S. Energy Information Administration (EIA), Release Spot Prices", "Public Domain: Citation requested", "si, con cita", "Precio spot WTI de la EIA (EE. UU. con cita)."),
    "DCOILBRENTEU": ("U.S. Energy Information Administration (EIA), Release Spot Prices", "Public Domain: Citation requested", "si, con cita", "Precio spot Brent de la EIA (EE. UU. con cita)."),
    "DEXBZUS": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Real brasileño: par regional, Fed H.10."),
    "DEXMXUS": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Peso mexicano: par regional, Fed H.10."),
    "DEXCAUS": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Dólar canadiense, Fed H.10."),
    "DEXCHUS": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Yuan chino, Fed H.10."),
    "DEXINUS": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Rupia india, Fed H.10."),
    "DEXJPUS": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Yen japonés, Fed H.10."),
    "DEXUSUK": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Libra esterlina, Fed H.10."),
    "DEXNOUS": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Corona noruega, Fed H.10."),
    "DEXUSNZ": ("Board of Governors of the Federal Reserve System (US), Release H.10", "Public Domain: Citation requested", "si, con cita", "Dólar neozelandés, Fed H.10."),
    "PCOPPUSDM": ("International Monetary Fund (IMF), Release Primary Commodity Prices", "Copyrighted: Citation required (third party)", "hay que revisar", "Aviso de copyright de terceros en la página de la serie («Copyright © 2016, IMF. Reprinted with permission; términos en imf.org/external/terms.htm»): revisar términos del FMI antes de uso comercial en producción; ver _licencias.md."),
}


def log(msg):
    line = f"{dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')} {msg}"
    print(line, flush=True)
    try:
        os.makedirs(os.path.dirname(PROGRESS_LOG), exist_ok=True)
    except (OSError, ValueError):
        return
    with open(PROGRESS_LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def get(url, retries=5):
    last = None
    wait = SLEEP_S
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 404:
                raise
        except Exception as e:  # noqa: BLE001
            last = e
        if attempt < retries - 1:
            time.sleep(wait)
            wait *= 2
    raise last


def next_business_day(fecha_iso):
    d = dt.date.fromisoformat(fecha_iso[:10]) + dt.timedelta(days=1)
    # FRED daily closes are business days; per the brief the value
    # is usable the next business day. This is a calendar-only
    # convention (no Peruvian/US holiday table) — same as the bcrp
    # module, which uses +1 day: for weekends the Saturday case is
    # pushed to Monday. Peru/US holidays are rare and flagged in
    # validate() per-year.
    while d.weekday() >= 5:
        d += dt.timedelta(days=1)
    return d.isoformat()


def monthly_disponible(fecha_iso):
    y, m = int(fecha_iso[:4]), int(fecha_iso[5:7])
    m += 1
    if m > 12:
        m, y = 1, y + 1
    return f"{y:04d}-{m:02d}-01"


def parse_csv(text, sid):
    points = []
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    if not lines or lines[0] != f"observation_date,{sid}":
        raise RuntimeError(f"unexpected header: {lines[0][:80] if lines else '(empty)'}")
    for line in lines[1:]:
        date, _, val = line.partition(",")
        val = val.strip()
        if not val or val == ".":
            continue  # FRED missing marker
        try:
            value = float(val)
        except ValueError:
            continue
        points.append((date.strip(), value))
    return sorted(points)


def write_series(sid, points, freq):
    path = os.path.join(DATA_DIR, sid + ".csv")
    tmp = path + ".tmp"
    seen = set()
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["fecha", "valor", "fecha_disponible"])
        for fecha, valor in points:
            if fecha in seen:
                continue
            seen.add(fecha)
            if freq == "mensual":
                disp = monthly_disponible(fecha)
            else:
                disp = next_business_day(fecha)
            w.writerow([fecha, repr(valor), disp])
    os.replace(tmp, path)


def truncate_to_2005(points):
    out = []
    for fecha, valor in points:
        if fecha < f"{START_YEAR}-01-01":
            continue
        if fecha > END:
            continue  # never leak the future into the V7 engine
        out.append((fecha, valor))
    return out


def validate(sid, points, freq):
    fechas = [p[0] for p in points]
    issues = []
    if len(fechas) != len(set(fechas)):
        issues.append("duplicadas")
    if freq == "diaria" and len(points) > 100:
        d0, d1 = dt.date.fromisoformat(fechas[0]), dt.date.fromisoformat(fechas[-1])
        present = set(fechas)
        missing_weekdays = 0
        cur = d0
        while cur <= d1:
            if cur.weekday() < 5 and cur.isoformat() not in present:
                missing_weekdays += 1
            cur += dt.timedelta(days=1)
        # US/Peru holidays explain most weekday gaps (~10-15 per
        # year combined); flag only an anomalous > 60 per year.
        per_year = missing_weekdays / max(1, (d1.year - d0.year + 1))
        if per_year > 60:
            issues.append(f"huecos diarias sospechosos: {missing_weekdays} días hábiles sin dato en {per_year:.0f}/año aprox.")
    if freq == "mensual" and points:
        d0 = dt.date.fromisoformat(fechas[0])
        d1 = dt.date.fromisoformat(fechas[-1])
        expected = (d1.year - d0.year) * 12 + (d1.month - d0.month) + 1
        if len(points) < expected - 2:
            issues.append(f"huecos mensuales sospechosos: {len(points)} de {expected} meses")
    return issues


def write_indice(rows):
    path = os.path.join(DATA_DIR, "_indice.csv")
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "nombre", "unidad", "fuente", "frecuencia", "primera_fecha",
                    "ultima_fecha", "n_puntos", "rezago_disponibilidad_dias", "nota"])
        for r in rows:
            w.writerow(r)


def write_licencias():
    path = os.path.join(DATA_DIR, "_licencias.md")
    lines = [
        "# Licencias — módulo externos (V7)",
        "",
        "Verificadas el 2026-11-09 en cada página de serie de FRED",
        "(`https://fred.stlouisfed.org/series/<ID>`, apartado de",
        "Fuente / Notas / etiqueta JSON-LD `license`) y en",
        "https://fred.stlouisfed.org/legal/ (términos de uso de los",
        "servicios FRED). Cada fila indica la fuente original, la",
        "etiqueta de copyright de FRED y si puede usarse en producción",
        "comercial. Marca «hay que revisar» = tiene aviso de copyright",
        "de terceros: contactar al titular antes de usarla en",
        "producción; la serie se descarga para investigación pero no",
        "debe entrar al motor de producción hasta revisar.",
        "",
        "| ID | Fuente (página FRED) | Etiqueta FRED | Uso comercial en producción |",
        "|---|---|---|---|",
    ]
    for sid, name, unit, freq in SERIES:
        source, label, use, note = LICENCES[sid]
        lines.append(f"| {sid} | {source} | {label} | {use} — {note} |")
    lines += [
        "",
        "## Notas de licencias",
        "",
        "- **Dominio público (H.10 / H.15 de la Fed, EIA)**: obra del",
        "  Gobierno de EE. UU.; FRED la etiqueta «Public Domain:",
        "  Citation requested». Uso comercial permitido con cita de",
        "  la fuente vía FRED (p. ej. «Source: Board of Governors of",
        "  the Federal Reserve System via FRED»).",
        "- **Citation required (Federal Reserve Bank of St. Louis,",
        "  derivados de tipos del Tesoro)**: T10Y2Y, T10YIE y T5YIFR",
        "  son de la Fed de St. Louis a partir de datos del Tesoro;",
        "  uso comercial permitido con cita (los términos en",
        "  https://fred.stlouisfed.org/legal/#fred-terms lo permiten",
        "  para fines internos/comerciales con atribución).",
        "- **Terceros con aviso de copyright — «hay que revisar»**:",
        "  **VIXCLS** (CBOE, «Copyright, 2016, Chicago Board Options",
        "  Exchange, Inc. Reprinted with permission») y **PCOPPUSDM**",
        "  (FMI, «Copyright © 2016, International Monetary Fund.",
        "  Reprinted with permission», términos completos en",
        "  http://www.imf.org/external/terms.htm). Aunque FRED las",
        "  etiqueta «Citation required», el titular exige permiso",
        "  previo para usos distintos del personal/no comercial",
        "  (legal/, FAQ 3): no entran a producción hasta revisar.",
        "- **Excluida: BAMLC0A0CM** (ICE BofA US Corporate Index",
        "  Option-Adjusted Spread, Ice Data Indices LLC, «Copyrighted:",
        "  Pre-approval required», solo 2023-11-07–hoy y FRED avisa",
        "  que desde abril de 2026 la serie conservará 3 años). No se",
        "  descarga: licencia restrictiva y serie corta. No hay en",
        "  FRED un spread de mercados emergentes de dominio público",
        "  (sin clave) que cubra desde 2005: la vía de dominio",
        "  público para la curva del Tesoro es la propia serie H.15",
        "  (y, como alternativa directa, el portal del Tesoro de",
        "  EE. UU. — ver README). El spread EMBI de J.P. Morgan no",
        "  está en FRED con licencia libre y no se incluye.",
        "- **Tesoro de EE. UU. (treasury.gov)**: las yield curves",
        "  diarias publicadas en el portal de Interest Rate Statistics",
        "  son obra del Gobierno de EE. UU. (dominio público, 17 U.S.C.",
        "  § 105) con cita; FRED H.15 republica exactamente esa misma",
        "  curva (metodología del Tesoro vía la Fed de Nueva York).",
        "  Este módulo no hace un segundo fetch a treasury.gov porque",
        "  el sitio sirve la tabla renderizada con JavaScript sin un",
        "  CSV estable; H.15 es la misma fuente pública.",
        "- Los términos de FRED prohíben, además, usar los servicios",
        "  FRED «in connection with the development or training of any",
        "  software program or system or machine learning» y prohíben",
        "  la minería/extracción masiva (legal/#full-fred-terms).",
        "  Este módulo descarga puntual/desde 2005 por serie con",
        "  ritmo educado para investigación interna; el motor V7",
        "  debe revisarlo con la normativa antes de producción.",
        "",
        "## Series incluidas (ver README)",
        "",
        "BAMLC0A0CM (ICE BofA OAS, pre-aprobación y serie corta) y",
        "T5YIFR (breakeven 5a5a, disponible con cita pero redundante",
        "con T10YIE; queda documentada en _indice.csv con n_puntos 0",
        "y nota, sin descargar).",
    ]
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(lines) + "\n")


def download_one(sid, full=True):
    sl = [s for s in SERIES if s[0] == sid][0]
    _, name, unit, freq = sl
    url = FRED.format(sid=sid)
    if not full:
        # short recent probe slice to keep the check quick
        probe_end = END
        probe_start = (dt.date.fromisoformat(END) - dt.timedelta(days=60)).isoformat()
        url = url + f"&cosd={probe_start}&coed={probe_end}"
    text = get(url)
    time.sleep(SLEEP_S)
    points = parse_csv(text, sid)
    if full:
        points = truncate_to_2005(points)
    else:
        points = [p for p in points if p[0] <= END]
    if not points:
        log(f"WARN {sid}: 0 puntos con datos")
        return None
    issues = validate(sid, points, freq)
    if issues:
        log(f"VALIDATE {sid}: {'; '.join(issues)}")
    write_series(sid, points, freq)
    log(f"DONE {sid}: {len(points)} puntos {points[0][0]}–{points[-1][0]}")
    return points


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="verify one recent slice per series only")
    ap.add_argument("--only", default="", help="comma-separated ids to (re)download")
    args = ap.parse_args()
    os.makedirs(DATA_DIR, exist_ok=True)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    rows = []
    for sid, name, unit, freq in SERIES:
        source, label, use, note = LICENCES[sid]
        if only and sid not in only:
            path = os.path.join(DATA_DIR, sid + ".csv")
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    r = list(csv.DictReader(f))
                    if r:
                        lag = 1 if freq == "diaria" else 31
                        rows.append([sid, name, unit, source, freq, r[0]["fecha"], r[-1]["fecha"], len(r), lag, ""])
            continue
        # resumable: skip if the on-disk file already reaches END
        # (full runs only; probe mode always refetches a slice)
        if not args.probe and not only:
            path = os.path.join(DATA_DIR, sid + ".csv")
            if os.path.exists(path) and os.path.getsize(path) > 200:
                try:
                    with open(path, encoding="utf-8") as f:
                        r = list(csv.DictReader(f))
                        if r and r[-1]["fecha"] >= END:
                            lag = 1 if freq == "diaria" else 31
                            rows.append([sid, name, unit, source, freq, r[0]["fecha"], r[-1]["fecha"], len(r), lag, "reusada"])
                            continue
                except (OSError, csv.Error, KeyError):
                    pass
        pts = download_one(sid, full=not args.probe)
        if pts:
            lag = 1 if freq == "diaria" else 31
            rows.append([sid, name, unit, source, freq, pts[0][0], pts[-1][0], len(pts), lag, ""])
        else:
            lag = 1 if freq == "diaria" else 31
            rows.append([sid, name, unit, source, freq, "", "", 0, lag,
                         "sin datos (HTTP 404 o serie sin cobertura)"])
    # documented exclusions: no CSV, but rows so the indice is complete
    rows.append(["BAMLC0A0CM", "ICE BofA US Corporate Index Option-Adjusted Spread", "Percent",
                 "Ice Data Indices, LLC", "diaria", "", "", 0, 1,
                 "no descargada: licencia pre-approval + 3 años de serie"])
    rows.append(["T5YIFR", "5-Year, 5-Year Forward Inflation Expectation Rate", "Percent",
                 "Federal Reserve Bank of St. Louis, Release Interest Rate Spreads", "diaria", "", "", 0, 1,
                 "no descargada: redundante con T10YIE (documentada con cita requerida, no fetch)"])
    write_indice(rows)
    write_licencias()
    log("INDICE actualizado " + str(len(rows)) + " series")


if __name__ == "__main__":
    main()
