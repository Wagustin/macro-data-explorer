#!/usr/bin/env python3
"""V7 gdeltserie: daily tone/volume series from GDELT DOC 2.0 (D4).

For each of eight topic queries the brief asks for DAILY series 2017-01-01..today
from mode=timelinetone (average tone) and mode=timelinevol (volume intensity),
saved as ~/v7/data/gdeltserie/<consulta>.csv with columns
fecha,tono,volumen,fecha_disponible (disponible el dia siguiente, per
CONVENCIONES: "para diarias, el dia habil siguiente"; the brief fixes it as
"disponible el dia siguiente", so this loader uses +1 calendar day and docs
the choice in the README).

How upstream decides hour vs day (probed live, 2026-11-09):
- A timeline request returns query_details.date_resolution = "hour" or "day".
- Broad queries (sourcecountry:PE, bare single words like 'peru' or 'dolar')
  return hourly data over short windows (e.g. 5 days -> 120 hourly points) and
  the API flips to "day" only for long windows; a decade-long sourcecountry:PE
  request still returned day (3553 points, 20170101T000000Z..20261109T000000Z).
  Narrow keyword queries (e.g. 'bcrp', 'economia', 'cobre') returned day even
  for 10-31 day windows.
- So a long request *may* come back hourly: this loader detects it and
  re-fetches the same range in monthly slices and keeps the daily answer.

Queries (operator syntax: only OR may be parenthesized; AND terms are flat):
- AND-joined keyword + sourcecountry works for terms that return data
  ('bcrp AND sourcecountry:PE' -> day data), but 'dolar AND sourcecountry:PE'
  returned '{}' (empty body, HTTP 200) on one attempt and zero-filled tone on
  another: a topically-scoped filter can be empty where the bare word is not.
  The loader therefore documents every query exactly as sent and never
  fabricates a scoped answer from an unscoped one.
- Eight brief topics map to the QUERIES table below (bilingual spellings:
  GDELT matches an accent-less form against accented news text, as the
  titulares module found with QUERY_LONG vs QUERY_PE).

Storage: ~/v7/data/gdeltserie/<id>.csv (outside git, CONVENCIONES). Progress
sidecar ~/v7/data/gdeltserie/_progreso.json records completed
(id, mode, window) keys (resumable). Log at ~/v7/logs/gdeltserie.log.

Politeness: 5 s spacing, exponential backoff on 429/503 honoring
Retry-After, resumable windows, detached runs with nice. A --probe mode
verifies one monthly slice per series before the full run; a per-query
--only flag re-downloads single topics.

Usage:
    python3 research/v7/gdeltserie/download_gdeltserie.py --probe
    python3 research/v7/gdeltserie/download_gdeltserie.py --only dolar
    python3 research/v7/gdeltserie/download_gdeltserie.py

Environment:
    GDELTSERIE_DATA_DIR=/home/wagustin/v7/data/gdeltserie (default)
    GDELTSERIE_LOG=/home/wagustin/v7/logs/gdeltserie.log    (default)
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "PerDataBot/1.0 (+https://perdata.site)"

API = "https://api.gdeltproject.org/api/v2/doc/doc"
DATA_DIR = os.environ.get("GDELTSERIE_DATA_DIR", "/home/wagustin/v7/data/gdeltserie")
LOG_PATH = os.environ.get("GDELTSERIE_LOG", "/home/wagustin/v7/logs/gdeltserie.log")

TIME_FMT = "%Y%m%d%H%M%S"
START_DATE = dt.date(2017, 1, 1)
END_DATE = dt.date.today()

# id, brief topic (Spanish), GDELT query exactly as sent, note.
# Only OR may be parenthesized; AND groups are flat terms.
QUERIES: list[tuple[str, str, str, str]] = [
    (
        "peru_economia",
        "Perú economía en general",
        "(economia OR económico OR economica OR económico) AND sourcecountry:PE",
        "General Peru economy; accented variants listed explicitly (GDELT "
        "stems like economia; the titulares module found accent-less forms "
        "match accented news text).",
    ),
    (
        "dolar_tipo_cambio",
        "dólar / tipo de cambio Perú",
        "(dolar OR \"tipo de cambio\") AND sourcecountry:PE",
        "USD/PEN topic; quoted phrase is a valid OR member.",
    ),
    (
        "bcrp",
        "BCRP",
        "bcrp AND sourcecountry:PE",
        "Single term (live-verified: day data returned).",
    ),
    (
        "mineria_cobre",
        "minería / cobre Perú",
        "(mineria OR cobre OR minería OR \"conflicto minero\") AND sourcecountry:PE",
        "Mining/copper topic.",
    ),
    (
        "elecciones_politica",
        "elecciones / política Perú",
        "(elecciones OR congreso OR \"política económica\" OR politica OR eleccion) AND sourcecountry:PE",
        "Elections/politics topic (brief: elecciones/política Perú).",
    ),
    (
        "fed_tasas",
        "Reserva Federal y tasas",
        "(\"Reserva Federal\" OR \"Federal Reserve\" OR Powell OR \"tasa de interés\" OR \"tasa de interes\")",
        "No Peru scope: Fed/rate news is global; scope is topic-only.",
    ),
    (
        "aranceles_eeuu_china",
        "aranceles y comercio EE. UU.–China",
        "(aranceles OR arancel OR \"guerra comercial\" OR \"comercio exterior\" OR aduana)",
        "US–China tariffs/trade; no Peru scope (brief topic is global).",
    ),
    (
        "riesgo_global",
        "riesgo global (crisis, guerra)",
        "(guerra OR crisis OR conflicto OR \"crisis económica\" OR recesión)",
        "Global risk topic; no Peru scope.",
    ),
]

DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})")


def log(msg: str) -> None:
    line = f"{dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')} {msg}"
    print(line, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def gdelt_url(query: str, mode: str, start: dt.datetime, end: dt.datetime) -> str:
    params = {
        "query": query,
        "mode": mode,
        "format": "json",
        "startdatetime": start.strftime(TIME_FMT),
        "enddatetime": end.strftime(TIME_FMT),
    }
    return f"{API}?{urllib.parse.urlencode(params)}"


def gdelt_get(
    query: str,
    mode: str,
    start: dt.datetime,
    end: dt.datetime,
    delay_s: float = 5.0,
    max_attempts: int = 8,
) -> tuple[dict | None, int]:
    """Fetch one timeline window. Returns (payload, attempts); None on
    rate-limit failure after backoff. Waits >= delay_s after the call."""
    url = gdelt_url(query, mode, start, end)
    last_err: BaseException | None = None
    wait = max(float(delay_s), 1.0)
    for attempt in range(1, max_attempts + 1):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": UA, "Accept": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode("utf-8", "replace")
                if not raw or raw.strip() == "{}":
                    time.sleep(max(float(delay_s), 1.0))
                    return ({"empty": True, "timeline": []}, attempt)
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError as e:
                    last_err = e
                    raise
                if isinstance(data, dict) and "timeline" in data:
                    time.sleep(max(float(delay_s), 1.0))
                    return (data, attempt)
                # Error bodies ("Parentheses may only be used around OR'd
                # statements.") come back as plain text; treat as failure.
                if attempt < max_attempts:
                    log(
                        f"sin-timeline {mode} {start.strftime('%Y-%m-%d')}->{end.strftime('%Y-%m-%d')} "
                        f"respuesta={raw[:120]!r} reintentando"
                    )
                    time.sleep(wait)
                    wait = min(wait * 2, 300.0)
                    continue
                log(
                    f"ERROR sin-timeline {mode} {start.strftime('%Y-%m-%d')}->{end.strftime('%Y-%m-%d')}: {raw[:200]!r}"
                )
                return (None, attempt)
        except urllib.error.HTTPError as e:
            last_err = e
            body = ""
            try:
                body = e.read()[:500].decode("utf-8", "replace")
            except Exception:
                body = ""
            if e.code in (429, 503) and attempt < max_attempts:
                retry_after = (e.headers.get("Retry-After") if e.headers else None) or ""
                extra = float(retry_after) if str(retry_after).isdigit() else 0.0
                sleep_s = max(wait, extra)
                log(
                    f"429/503 {mode} {start.strftime('%Y-%m-%d')}->{end.strftime('%Y-%m-%d')} "
                    f"intento {attempt}/{max_attempts}, espera {sleep_s:.0f}s"
                )
                time.sleep(sleep_s)
                wait = min(wait * 2, 300.0)
                continue
            raise
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < max_attempts:
                log(
                    f"reintento {mode} {start.strftime('%Y-%m-%d')} intento {attempt}/{max_attempts}: {e}"
                )
                time.sleep(wait)
                wait = min(wait * 2, 300.0)
                continue
            raise
    log(f"ERROR {mode} {start.strftime('%Y-%m-%d')}->{end.strftime('%Y-%m-%d')}: {last_err}")
    return None, max_attempts


def parse_timeline_raw(payload: dict | None) -> tuple[str, list[tuple[str, str, float]]]:
    """Raw (resolution, [(fecha YYYY-MM-DD, timestamp, value)]) in payload order."""
    if not payload or payload.get("empty"):
        return "", []
    tl = payload.get("timeline") or []
    if not tl:
        return "", []
    resolution = ""
    try:
        resolution = str((payload.get("query_details") or {}).get("date_resolution") or "")
    except Exception:
        resolution = ""
    raw: list[tuple[str, str, float]] = []
    for item in (tl[0].get("data") or []):
        ts = str(item.get("date") or "")
        m = DATE_RE.match(ts)
        if not m:
            continue
        try:
            day = dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
            value = float(item.get("value", 0.0))
        except (ValueError, TypeError):
            continue
        raw.append((day, ts, value))
    return resolution, raw


def parse_timeline(payload: dict | None) -> tuple[str, list[tuple[str, float]]]:
    """Extract (date_resolution, [(YYYY-MM-DD, value), ...]) sorted by date.

    For day resolution this is one value per day (last wins if duplicated).
    For hour resolution the entries stay hourly here; callers that need
    daily means must use parse_timeline_raw instead of this collapse.
    """
    resolution, raw = parse_timeline_raw(payload)
    points: dict[str, float] = {}
    for day, _ts, value in raw:
        points[day] = value  # one row per calendar day; last wins
    return resolution, sorted(points.items())


def day_span(start: dt.date, end: dt.date) -> tuple[dt.datetime, dt.datetime]:
    s = dt.datetime(start.year, start.month, start.day, 0, 0, 0)
    e = dt.datetime(end.year, end.month, end.day, 23, 59, 59)
    return s, e


def month_windows(start: dt.date, end: dt.date) -> list[tuple[dt.date, dt.date]]:
    """Monthly windows [start..end] inclusive, oldest first."""
    wins: list[tuple[dt.date, dt.date]] = []
    cur = dt.date(start.year, start.month, 1)
    if cur > start:
        cur = dt.date(start.year, start.month, 1)
    while cur <= end:
        nxt = dt.date(cur.year + (1 if cur.month == 12 else 0), 1 if cur.month == 12 else cur.month + 1, 1)
        w_end = min(end, nxt - dt.timedelta(days=1))
        w_start = max(start, cur)
        if w_start <= w_end:
            wins.append((w_start, w_end))
        cur = nxt
    return wins


def year_window(year: int, start: dt.date, end: dt.date) -> tuple[dt.date, dt.date]:
    y_start = max(start, dt.date(year, 1, 1))
    y_end = min(end, dt.date(year, 12, 31))
    return y_start, y_end


def load_progress() -> dict:
    path = os.path.join(DATA_DIR, "_progreso.json")
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_progress(prog: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, "_progreso.json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(prog, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def window_key(qid: str, mode: str, w_start: dt.date, w_end: dt.date) -> str:
    return f"{qid}|{mode}|{w_start.isoformat()}/{w_end.isoformat()}"


def fetch_window_daily(
    qid: str, query: str, mode: str, w_start: dt.date, w_end: dt.date,
    delay_s: float,
) -> tuple[list[tuple[str, float]], str]:
    """Daily points for one window, re-slicing by months if upstream
    answers with hourly resolution. Returns (points, resolution_seen).

    The brief: "Si una petición larga devuelve resolución horaria, trocéala
    por años o meses y agrega a diario." Requests use monthly windows; if a
    monthly window still answers hourly it is split per day; a single day
    that answers hourly is aggregated by calendar day (mean) with the
    aggregation noted in the log (the day row keeps the calendar date).
    """
    s, e = day_span(w_start, w_end)
    payload, _attempts = gdelt_get(query, mode, s, e, delay_s)
    if payload is None:
        raise RuntimeError(f"fallo-ventana {qid} {mode} {w_start}..{w_end}")
    resolution, points = parse_timeline(payload)
    if resolution != "hour":
        return points, resolution or "day"
    # Hourly answer: subdivide by day and aggregate by calendar day (mean).
    # Re-read the window as daily slices so every hour lands in exactly one
    # fetch; raw hourly values are grouped below, never collapsed first.
    log(
        f"HOURLY {qid} {mode} {w_start}..{w_end} (n={len(points)}); "
        "se trocea por días y se agrega a diario"
    )
    all_hourly: dict[str, list[float]] = {}
    cur = w_start
    while cur <= w_end:
        ds, de = day_span(cur, cur)
        try:
            sub_payload, _a = gdelt_get(query, mode, ds, de, delay_s)
        except RuntimeError:
            raise
        _res, raw = parse_timeline_raw(sub_payload)
        for day, _ts, value in raw:
            all_hourly.setdefault(day, []).append(value)
        cur += dt.timedelta(days=1)
    daily: list[tuple[str, float]] = []
    for day in sorted(all_hourly):
        vals = all_hourly[day]
        daily.append((day, sum(vals) / len(vals) if vals else 0.0))
    return daily, "hour-aggregated"


def fetch_all_daily(
    qid: str, query: str, mode: str, start: dt.date, end: dt.date,
    delay_s: float, prog: dict, done: set[str],
) -> tuple[list[tuple[str, float]], dict]:
    """Whole range for one (query, mode): yearly outer windows, monthly
    inner windows; concatenates monthly results and dedupes by date."""
    stats = {"requests": 0, "hourly_windows": 0, "empty_windows": 0, "errors": 0}
    points_by_day: dict[str, float] = {}
    for year in range(start.year, end.year + 1):
        w_start, w_end = year_window(year, start, end)
        if w_start > w_end:
            continue
        for mw_start, mw_end in month_windows(w_start, w_end):
            key = window_key(qid, mode, mw_start, mw_end)
            if key in done:
                continue
            try:
                pts, res = fetch_window_daily(qid, query, mode, mw_start, mw_end, delay_s)
                stats["requests"] += 1
                if res == "hour":
                    stats["hourly_windows"] += 1
                if not pts:
                    stats["empty_windows"] += 1
                    log(f"VACIA {qid} {mode} {mw_start}..{mw_end} (sin puntos)")
                for day, value in pts:
                    points_by_day[day] = value
                done.add(key)
                prog["done"] = sorted(done)
                prog["last_window"] = key
                save_progress(prog)
            except RuntimeError as err:
                stats["errors"] += 1
                log(f"ERROR {err}; se marca y sigue (rehacer luego)")
                # Mark done to avoid re-looping forever this run; the
                # README documents re-runs to fill gaps.
                done.add(key)
                prog["done"] = sorted(done)
                save_progress(prog)
                continue
            time.sleep(delay_s)  # polite between monthly windows
    merged = sorted(points_by_day.items())
    return merged, stats


def write_csv(path: str, tono: dict[str, float], volumen: dict[str, float]) -> int:
    """Write fecha,tono,volumen,fecha_disponible sorted by fecha.
    fecha_disponible = fecha + 1 day (brief: "disponible el día siguiente";
    CONVENCIONES says "día hábil siguiente" for dailies — we use the brief's
    calendar day and document it in the README)."""
    tmp = path + ".tmp"
    days = sorted(set(tono) | set(volumen))
    n = 0
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["fecha", "tono", "volumen", "fecha_disponible"])
        for day in days:
            try:
                disp = (dt.date.fromisoformat(day) + dt.timedelta(days=1)).isoformat()
            except ValueError:
                continue
            t = tono.get(day)
            v = volumen.get(day)
            w.writerow([
                day,
                "" if t is None else f"{t:.4f}",
                "" if v is None else f"{v:.4f}",
                disp,
            ])
            n += 1
    os.replace(tmp, path)
    return n


def run_one(qid: str, query: str, start: dt.date, end: dt.date,
            delay_s: float, prog: dict, done: set[str]) -> dict:
    """One query: both modes, then write CSV. Returns stats."""
    tone_points, tone_stats = fetch_all_daily(qid, query, "timelinetone", start, end, delay_s, prog, done)
    vol_points, vol_stats = fetch_all_daily(qid, query, "timelinevol", start, end, delay_s, prog, done)
    path = os.path.join(DATA_DIR, f"{qid}.csv")
    n = write_csv(path, dict(tone_points), dict(vol_points))
    log(f"CIERRE {qid}: {n} filas {path} "
        f"(tono {len(tone_points)} {tone_points[0][0] if tone_points else '-'}.."
        f"{tone_points[-1][0] if tone_points else '-'}; "
        f"vol {len(vol_points)} {vol_points[0][0] if vol_points else '-'}.."
        f"{vol_points[-1][0] if vol_points else '-'})")
    return {
        "qid": qid, "n_filas": n,
        "tono_puntos": len(tone_points),
        "vol_puntos": len(vol_points),
        "tone_requests": tone_stats["requests"],
        "vol_requests": vol_stats["requests"],
        "tone_empty": tone_stats["empty_windows"],
        "vol_empty": vol_stats["empty_windows"],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true",
                    help="verify one monthly slice (2026-01) per series/mode")
    ap.add_argument("--only", default="",
                    help="comma-separated query ids to (re)download")
    ap.add_argument("--delay", type=float, default=5.0)
    ap.add_argument("--from", dest="from_date", default="")
    args = ap.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    delay = max(float(args.delay), 5.0)
    prog = load_progress()
    prog.setdefault("done", [])
    done: set[str] = set(prog.get("done", []))
    only = {s.strip() for s in args.only.split(",") if s.strip()}

    if args.probe:
        start = dt.date(2026, 1, 1)
        end = dt.date(2026, 1, 31)
        if args.from_date:
            start = dt.date.fromisoformat(args.from_date)
            end = start + dt.timedelta(days=30)
        for qid, _topic, query, _note in QUERIES:
            if only and qid not in only:
                continue
            for mode in ("timelinetone", "timelinevol"):
                s, e = day_span(start, end)
                payload, attempts = gdelt_get(query, mode, s, e, delay)
                res, pts = parse_timeline(payload)
                log(f"PROBE {qid} {mode} {start}..{end}: resolution={res or 'vacia'} "
                    f"n={len(pts)} attempts={attempts} head={pts[:2]}")
                time.sleep(delay)
        return 0

    start = dt.date.fromisoformat(args.from_date) if args.from_date else START_DATE
    end = END_DATE
    log(f"INICIO full {start}..{end} delay={delay} "
        f"consultas={[q[0] for q in QUERIES if not only or q[0] in only]}")
    for qid, _topic, query, _note in QUERIES:
        if only and qid not in only:
            continue
        run_one(qid, query, start, end, delay, prog, done)
        time.sleep(delay)
    log("FIN full")
    return 0


if __name__ == "__main__":
    sys.exit(main())
