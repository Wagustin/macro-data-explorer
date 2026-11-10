#!/usr/bin/env python3
"""V7 BCRP: full-history BCRPData download.

Resumable writer of ~/v7/data/bcrp/<ID>.csv + _indice.csv, fecha_disponible
per CONVENCIONES, polite rate (6 s between requests), exponential retries,
progress log ~/v7/logs/bcrp.log. Runs detached (setsid nohup); a small
--probe mode verifies one slice before the full run.

Usage:
    python3 research/v7/bcrp/download_bcrp.py --probe
    python3 research/v7/bcrp/download_bcrp.py

Environment:
    BCRP_DATA_DIR=/home/wagustin/v7/data/bcrp (default)
    BCRP_LOG=/home/wagustin/v7/logs/bcrp.log   (default)
"""
import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

UA = "PerDataResearchBot/1.0 (+https://perdata.site)"
API = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/{code}/json/{start}/{end}"
DATA_DIR = os.environ.get("BCRP_DATA_DIR", "/home/wagustin/v7/data/bcrp")
PROGRESS_LOG = os.environ.get("BCRP_LOG", "/home/wagustin/v7/logs/bcrp.log")
SLEEP_S = 6  # BCRP blocks bursts: polite spacing, always.
END = dt.date.today().isoformat()
START_YEAR = 1985  # harmless pre-history: the API answers n.d. before a series starts

MONTHS = {"Ene": "01", "Feb": "02", "Mar": "03", "Abr": "04", "May": "05", "Jun": "06",
          "Jul": "07", "Ago": "08", "Set": "09", "Sep": "09", "Oct": "10", "Nov": "11",
          "Dic": "12"}

# id, code, name, unit, frequency, scale, availability lag days (monthly: 45 per CONVENCIONES)
SERIES = [
    ("tipo_cambio", "PD04640PD", "Tipo de cambio interbancario (SBS, venta)", "S/ por US$", "diaria", 1, 1),
    ("cobre", "PD04701XD", "Cobre (Londres)", "US$ por libra", "diaria", 0.01, 1),
    ("oro", "PD04704XD", "Oro (Londres)", "US$ por onza troy", "diaria", 1, 1),
    ("plata", "PD04702XD", "Plata", "US$ por onza troy", "diaria", 1, 1),
    ("zinc", "PD04703XD", "Zinc (Londres)", "US$ por libra", "diaria", 0.01, 1),
    ("wti", "PD04705XD", "WTI", "US$ por barril", "diaria", 1, 1),
    ("rin", "PD04650MD", "Reservas internacionales netas", "Millones US$", "diaria", 1, 1),
    ("posicion_cambio", "PD04649MD", "Posición de cambio", "Millones US$", "diaria", 1, 1),
    ("tasa_referencia", "PD12301MD", "Tasa de referencia", "% anual", "diaria", 1, 1),
    ("intervencion_bcrp", "PD04658MD", "Operaciones cambiarias del BCRP", "Millones US$", "diaria", 1, 1),
    ("compras_mesa", "PD04659MD", "Compras en mesa de negociación", "Millones US$", "diaria", 1, 1),
    ("swaps_cambiarios", "PD04660MD", "Swaps cambiarios netos", "Millones US$", "diaria", 1, 1),
    ("cdr", "PD37517TD", "CDR emitido", "Millones US$", "diaria", 1, 1),
    ("swap_venta", "PD37521TD", "Swap venta pactado", "Millones US$", "diaria", 1, 1),
    ("inflacion_anual", "PN01273PM", "Inflación anual (IPC var.% 12 meses)", "Var. % 12 meses", "mensual", 1, 45),
    ("inflacion_subyacente", "PN01277PM", "Inflación subyacente (var.% 12 meses)", "Var. % 12 meses", "mensual", 1, 45),
    ("terminos_intercambio", "PN38923BM", "Términos de intercambio", "Índice 2007 = 100", "mensual", 1, 45),
    ("cobre_exportacion", "PN38784BM", "Exportaciones de cobre (precio)", "¢US$ por libra", "mensual", 1, 45),
]


def log(msg):
    line = f"{dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')} {msg}"
    print(line, flush=True)
    os.makedirs(os.path.dirname(PROGRESS_LOG), exist_ok=True)
    with open(PROGRESS_LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def get(url, retries=4):
    last = None
    wait = SLEEP_S
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode("utf-8", "replace")
            if raw.lstrip().startswith("<"):
                raise RuntimeError("HTML (bot check?)")
            cut = raw[: raw.index("<")] if raw.find("<") > 0 else raw
            return json.loads(cut[: cut.rindex("}") + 1])
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


def parse_points(data, freq, scale):
    points = []
    for per in data.get("periods", []):
        try:
            value = float(per["values"][0])
        except (ValueError, KeyError, IndexError, TypeError):
            continue  # "n.d." = not published
        pname = per.get("name", "")
        if freq == "diaria":
            m = re.match(r"^(\d{2})\.([A-Za-z]{3})\.(\d{2})$", pname)
            if m and m.group(2) in MONTHS:
                day = f"20{m.group(3)}-{MONTHS[m.group(2)]}-{m.group(1)}"
                points.append((day, round(value * scale, 6)))
        else:
            m = re.match(r"^([A-Za-z]{3})\.(\d{4})$", pname)
            if m and m.group(1) in MONTHS:
                points.append((f"{m.group(2)}-{MONTHS[m.group(1)]}-01", round(value * scale, 6)))
    return sorted(points)


def disponible(fecha_iso, lag_days):
    d = dt.date.fromisoformat(fecha_iso[:10])
    if lag_days:
        d += dt.timedelta(days=lag_days)
    return d.isoformat()


def write_series(sid, points, lag_days):
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
            w.writerow([fecha, valor, disponible(fecha, lag_days)])
    os.replace(tmp, path)


def validate(sid, points, freq):
    fechas = [p[0] for p in points]
    issues = []
    if len(fechas) != len(set(fechas)):
        issues.append("duplicadas")
    if freq == "diaria" and points:
        d0, d1 = dt.date.fromisoformat(fechas[0]), dt.date.fromisoformat(fechas[-1])
        missing_weekdays = 0
        expected_holidays = 0
        cur = d0
        present = set(fechas)
        while cur <= d1:
            iso = cur.isoformat()
            if iso not in present:
                if cur.weekday() < 5:
                    missing_weekdays += 1
            cur += dt.timedelta(days=1)
        # Peru public holidays + weekends explain most weekday gaps; flag > 60 missing weekdays/year
        per_year = missing_weekdays / max(1, (d1.year - d0.year + 1))
        if per_year > 60:
            issues.append(f"huecos diarias sospechosos: {missing_weekdays} días hábiles sin dato en {per_year:.0f}/año aprox.")
    return issues


def download_one(sid, code, freq, scale, lag_days, full=True):
    start = f"{START_YEAR}-01-01" if full else f"{int(END[:4]) - 1}-01-01"
    data = get(API.format(code=code, start=start, end=END))
    time.sleep(SLEEP_S)
    points = [p for p in parse_points(data, freq, scale) if p[0][:4] <= END[:4]]
    # The API fills future working days with projections (n.d.-replaced values
    # after today); keep only up to today.
    points = [p for p in points if p[0] <= END]
    if not points:
        log(f"WARN {sid} ({code}): 0 puntos con datos (¿código inválido o serie sin cobertura?)")
        return None
    issues = validate(sid, points, freq)
    if issues:
        log(f"VALIDATE {sid}: {'; '.join(issues)}")
    write_series(sid, points, lag_days)
    log(f"DONE {sid} ({code}): {len(points)} puntos {points[0][0]}–{points[-1][0]}")
    return points


def write_indice(rows):
    path = os.path.join(DATA_DIR, "_indice.csv")
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "codigo", "nombre", "unidad", "frecuencia", "primera_fecha",
                    "ultima_fecha", "n_puntos", "rezago_disponibilidad_dias", "nota"])
        for r in rows:
            w.writerow(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="verify one recent slice per series only")
    ap.add_argument("--only", default="", help="comma-separated ids to (re)download")
    args = ap.parse_args()
    os.makedirs(DATA_DIR, exist_ok=True)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    rows = []
    # existing indice rows for series we do not redo this run
    for sid, code, name, unit, freq, scale, lag in SERIES:
        if only and sid not in only:
            path = os.path.join(DATA_DIR, sid + ".csv")
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    r = list(csv.DictReader(f))
                    if r:
                        rows.append([sid, code, name, unit, freq, r[0]["fecha"], r[-1]["fecha"],
                                     len(r), lag, ""])
            continue
        pts = download_one(sid, code, freq, scale, lag, full=not args.probe)
        if pts:
            rows.append([sid, code, name, unit, freq, pts[0][0], pts[-1][0], len(pts), lag, ""])
        else:
            rows.append([sid, code, name, unit, freq, "", "", 0, lag,
                         "sin datos del API (código no válido o serie sin cobertura)"])
    write_indice(rows)
    log("INDICE actualizado " + str(len(rows)) + " series")


if __name__ == "__main__":
    main()
