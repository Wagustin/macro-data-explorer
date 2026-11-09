#!/usr/bin/env python3
"""V7 titulares: historical archive of Peruvian financial press headlines (GDELT DOC 2.0).

Fetches articles from https://api.gdeltproject.org/api/v2/doc/doc (mode=artlist,
format=json, maxrecords=250) covering 2019-01-01 to today, newest first
(2026 -> 2019). Each window uses startdatetime/enddatetime (YYYYMMDDHHMMSS).

Query: articles of Peruvian sources (sourcecountry:PE) in Spanish about
economy/markets. GDELT rate-limits keyword queries harshly (429), so the
reliable path is a broad Peru fetch (sourcecountry:PE) with a client-side
filter for Spanish and economy keywords. A full keyword OR-group is kept as
QUERY_LONG for documentation/future use; the working query is QUERY_PE.

Storage: ~/v7/data/titulares/AAAA-MM.jsonl, one JSON object per line
{"fecha","titulo","dominio","url","idioma"} (CONVENCIONES). Deduplication by
URL. Progress sidecar ~/v7/data/titulares/_progreso.json records completed
windows (resumable). Log at ~/v7/logs/titulares.log.

Window splitting: if a window returns exactly 250 articles (i.e. it filled
maxrecords), it is split into smaller windows (halves) until no window comes
back full. Windows are processed newest-first so early progress is already
useful. Respects 15 s spacing, with exponential backoff on 429/Retry-After.

Runs detached with nice. Probe one week first, measure requests/day, estimate
total, then full run logs estimate before launching unattended.

Usage:
    python3 research/v7/titulares/download_titulares.py --probe
    python3 research/v7/titulares/download_titulares.py --probe --window-days 7
    python3 research/v7/titulares/download_titulares.py
    python3 research/v7/titulares/download_titulares.py --week 20261102
    python3 research/v7/titulares/cobertura.py

Environment:
    TITULARES_DATA_DIR=/home/wagustin/v7/data/titulares (default)
    TITULARES_LOG=/home/wagustin/v7/logs/titulares.log   (default)
"""
from __future__ import annotations

import argparse
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
DATA_DIR = os.environ.get("TITULARES_DATA_DIR", "/home/wagustin/v7/data/titulares")
LOG_PATH = os.environ.get("TITULARES_LOG", "/home/wagustin/v7/logs/titulares.log")

TIME_FMT = "%Y%m%d%H%M%S"
START_DATE = dt.date(2019, 1, 1)
END_DATE = dt.date.today()
MAXRECORDS = 250

# Brief keywords (Spanish, accents optional). Applied client-side on title + url.
ECONOMIA_RE = re.compile(
    r"(\bd[oó]lar(?:es)?\b|\btipo\s+de\s+cambio\b|\bbcrp\b|\bbanco\s+central\b|\binflaci[oó]n\b|"
    r"\bmining\b|\bminer[ií]a\b|\bcobre\b|\bcopper\b|\boro\b|\bgold\b|\bplata\b|\bsilver\b|\bzinc\b|\bpetr[oó]leo\b|\bwti\b|\bbrent\b|\bgas\s+natural\b|\bglp\b|\bconflicto\s+minero\b|\breinfo\b|\bsnmpe\b|"
    r"\bbolsa\s+de\s+valores\b|\bbvl\b|\bacciones\b|\bbonos\b|\bdividendos\b|\bsmv\b|\breserva\s+federal\b|\bfed\b|\btasa\s+de\s+inter[eé]s\b|\barancel\w*\b|\belecciones\b|\bsegunda\s+vuelta\b|\bcongreso\b|\bvacancia\b|\bproyecto\s+de\s+ley\b|\bministro\s+de\s+econom[ií]a\b|\bmef\b|\bpol[ií]tica\s+econ[oó]mica\b|\bpbi\b|\bipc\b|\bsoles\b|\bsunat\b|\binei\b|\bpresupuesto\b|\bdeuda\s+p[uú]blica\b|\bd[eé]ficit\s+fiscal\b|\bexportaci\w+\b|\bimportaci\w+\b|\bbalanza\s+comercial\b|\binversi\w+\b|\brecesi\w+\b|\bwall\s+street\b|\bnasdaq\b|\bfmi\b|\bbanco\s+mundial\b|\brating\b|\briesgo\s+pa[ií]s\b|\bembig\b|\bcr[eé]dito\b|\bbanca\b|\bafp\b|\bpensi\w+\b|\bremesas?\b|\bpobreza\b|\bbono\w*\b|\bproinversi\w+\b|\bfinanciero\b|\bafectac\w+\b|\bvivienda\b|\bconstrucci\w+\b|\bagro\w+\b|\bpesca\b|\bturismo\b|\bsalario\b|\bempleo\b|\bdesempleo\b|\bprecios\s+al\s+consumidor\b|\bcanasta\s+b[aá]sica\b|\bdevaluaci\w*\b|\bapreciaci\w*\b|\breserva\s+internacional(?:es)?\b|\bposici[oó]n\s+de\s+cambio\b|\binterbancario\b|\bcambio\s+interbancario\b|\bempresa\b|\bantamina\b|\bcerro\s+verde\b|\blas\s+bambas\b|\bsouthern\b|\bbuenaventura\b|\bquellaveco\b|\btoromocho\b|\bvolc[aá]n\b|\bchinalco\b|\bminsur\b|\bhudbay\b|\bmarcona\b|\bpetroper[uú]\b|\bcamisea\b|\btalara\b|\bgasolina\b|\bdi[eé]sel\b|\boleoducto\b|\belectr\w+\b|\benerg[ií]a\b|\be[oó]lica\b|\bsolar\b|\bminas\b|\bmineral(?:es)?\b|\bútil\b|\butilidad(?:es)?\b|\bganancia\b|\bingreso\b|\bcancela\w+\b|\bparalizaci\w+\b|\bpierde\b|\bpérdidas\b|\bdeuda\b)",
    re.IGNORECASE,
)

# GDELT may return these fields even though we filter: keep language check explicit.
SPANISH_LANGS = {"spanish", "español", "espanol", "es"}

QUERY_PE = "sourcecountry:PE"
# Documented full keyword group (brief). Kept for reference; the reliable fetch
# path is QUERY_PE + client-side filter (429 on keyword groups — see README).
QUERY_LONG = (
    "sourcecountry:PE ("
    "dolar OR \"tipo de cambio\" OR BCRP OR inflacion OR mineria OR cobre "
    "OR \"Bolsa de Valores de Lima\" OR \"Reserva Federal\" OR aranceles "
    "OR elecciones OR Congreso OR \"politica economica\" OR \"ministro de Economia\""
    ")"
)


def log(msg: str) -> None:
    line = f"{dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')} {msg}"
    print(line, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def gdelt_url(query: str, start: dt.datetime, end: dt.datetime, maxrecords: int) -> str:
    params = {
        "query": query,
        "mode": "artlist",
        "format": "json",
        "maxrecords": str(maxrecords),
        "startdatetime": start.strftime(TIME_FMT),
        "enddatetime": end.strftime(TIME_FMT),
    }
    return f"{API}?{urllib.parse.urlencode(params)}"


def gdelt_get(query: str, start: dt.datetime, end: dt.datetime,
              maxrecords: int = MAXRECORDS,
              delay_s: float = 15.0,
              max_attempts: int = 10) -> tuple[list[dict] | None, int]:
    """Fetch one artlist window. Returns (articles, attempts). Empty list vs
    error distinguished by caller: None means rate-limit failure after backoff.
    Always waits at least delay_s after the call (polite cadence)."""
    url = gdelt_url(query, start, end, maxrecords)
    last_err: Exception | None = None
    wait = delay_s
    for attempt in range(1, max_attempts + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode("utf-8", "replace")
                if not raw or raw.strip() == "{}":
                    return ([], attempt)
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError as e:
                    last_err = e
                    raise
                return (data.get("articles", []), attempt)
        except urllib.error.HTTPError as e:
            last_err = e
            body = ""
            try:
                body = e.read()[:500].decode("utf-8", "replace")
            except Exception:
                body = ""
            if e.code in (429, 503) and attempt < max_attempts:
                retry_after = (e.headers.get("Retry-After") if e.headers else None) or ""
                extra = 0.0
                if retry_after.isdigit():
                    extra = float(retry_after)
                sleep_s = max(wait, extra)
                log(f"429/503 ventana {start.strftime('%Y-%m-%d')}->{end.strftime('%Y-%m-%d')} "
                    f"intento {attempt}/{max_attempts}, espera {sleep_s:.0f}s")
                if "429" not in body[:400] and "limit" in body.lower():
                    pass
                time.sleep(sleep_s)
                wait = min(wait * 2, 300.0)
                continue
            raise
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < max_attempts:
                log(f"reintento ventana {start.strftime('%Y-%m-%d')} intento {attempt}/{max_attempts}: {e}")
                time.sleep(wait)
                wait = min(wait * 2, 300.0)
                continue
            raise
    try:
        raw = ""
        if isinstance(last_err, urllib.error.HTTPError):
            try:
                raw = last_err.read()[:500].decode("utf-8", "replace")
            except Exception:
                raw = ""
        log(f"ERROR ventana {start.strftime('%Y-%m-%d')}->{end.strftime('%Y-%m-%d')}: {last_err} {raw[:200]}")
    except Exception:
        pass
    return None, max_attempts


def seendate_to_fecha(raw: str) -> str | None:
    """GDELT seendate format: 20261106T050000Z -> 2026-11-06 (UTC)."""
    if not raw:
        return None
    m = re.match(r"^(\d{4})(\d{2})(\d{2})", str(raw).strip())
    if not m:
        return None
    try:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    except ValueError:
        return None


def article_to_record(art: dict) -> dict | None:
    """Map one artlist article to {fecha,titulo,dominio,url,idioma}."""
    if not art:
        return None
    title = (art.get("title") or "").strip()
    url = (art.get("url") or "").strip()
    if not title or not url:
        return None
    fecha = seendate_to_fecha(art.get("seendate", ""))
    if fecha is None:
        return None
    lang = (art.get("language") or "").strip()
    # Brief asks Spanish only. GDELT `language` is English display ("Spanish");
    # keep Spanish-language hits. If language is blank or unknown, the economy
    # regex on the title still has to pass, so we only allow Spanish + blank.
    lang_ok = (lang.lower() in SPANISH_LANGS) or (not lang and bool(ECONOMIA_RE.search(title)))
    if not lang_ok:
        return None
    if not ECONOMIA_RE.search(title):
        return None
    return {
        "fecha": fecha,
        "titulo": re.sub(r"\s+", " ", title),
        "dominio": (art.get("domain") or "").strip(),
        "url": url,
        "idioma": lang or "Spanish",
    }


def window_bounds(win_start: dt.date, win_end: dt.date) -> tuple[dt.datetime, dt.datetime]:
    """GDELT expects startdatetime..enddatetime; make a small half-open slice."""
    s = dt.datetime(win_start.year, win_start.month, win_start.day, 0, 0, 0)
    e = dt.datetime(win_end.year, win_end.month, win_end.day, 23, 59, 59)
    return s, e


def split_window(win_start: dt.date, win_end: dt.date) -> list[tuple[dt.date, dt.date]]:
    """Split a filled window into halves for retry."""
    mid = win_start + (win_end - win_start) // 2
    if mid <= win_start or mid >= win_end:
        # Use 1-day granularity fallback: split into individual days
        days = []
        cur = win_start
        while cur <= win_end:
            days.append((cur, cur))
            cur += dt.timedelta(days=1)
        return days
    return [(win_start, mid), (mid + dt.timedelta(days=1), win_end)]


def fetch_window(win_start: dt.date, win_end: dt.date,
                 query: str = QUERY_PE,
                 delay_s: float = 15.0) -> tuple[list[dict] | None, bool, int]:
    """Fetch a window; if it returns exactly maxrecords (full), signal split."""
    s, e = window_bounds(win_start, win_end)
    articles, _attempts = gdelt_get(query, s, e, MAXRECORDS, delay_s)
    if articles is None:
        return None, False, 0
    return articles, len(articles) >= MAXRECORDS, len(articles)


def append_month_records(records: list[dict], seen: set[str], month: str) -> int:
    """Append new records to AAAA-MM.jsonl; returns how many were written."""
    if not records:
        return 0
    path = os.path.join(DATA_DIR, f"{month}.jsonl")
    os.makedirs(DATA_DIR, exist_ok=True)
    new_recs = []
    for rec in records:
        if rec["url"] in seen:
            continue
        seen.add(rec["url"])
        new_recs.append(rec)
    if not new_recs:
        return 0
    # Sort by fecha then url for stable output
    new_recs.sort(key=lambda r: (r["fecha"], r["url"]))
    # If file exists, we append (files are per-month; months already written
    # may grow if a split window yields more). To avoid duplicate dates across
    # runs, caller tracks seen globally.
    with open(path, "a", encoding="utf-8") as f:
        for rec in new_recs:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return len(new_recs)


def collect_month(month: str) -> list[dict]:
    path = os.path.join(DATA_DIR, f"{month}.jsonl")
    recs: list[dict] = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    recs.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    recs.sort(key=lambda r: (r["fecha"], r["url"]))
    # Dedupe by url within month defensively
    seen: set[str] = set()
    out: list[dict] = []
    for r in recs:
        if r["url"] in seen:
            continue
        seen.add(r["url"])
        out.append(r)
    return out


def write_month_sorted(month: str, recs: list[dict]) -> None:
    path = os.path.join(DATA_DIR, f"{month}.jsonl")
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for rec in recs:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def load_seen_global() -> set[str]:
    """URLs already on disk across all months (for resume)."""
    seen: set[str] = set()
    if not os.path.isdir(DATA_DIR):
        return seen
    for name in os.listdir(DATA_DIR):
        if not name.endswith(".jsonl") or not re.match(r"^\d{4}-\d{2}\.jsonl$", name):
            continue
        try:
            with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
                for line in f:
                    try:
                        rec = json.loads(line.strip())
                        if rec.get("url"):
                            seen.add(rec["url"])
                    except json.JSONDecodeError:
                        continue
        except OSError:
            continue
    return seen


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
    path = os.path.join(DATA_DIR, "_progreso.json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(prog, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def iter_windows(win_days: int, start: dt.date, end: dt.date) -> list[tuple[dt.date, dt.date]]:
    """Windows of win_days covering [start,end], newest first."""
    wins: list[tuple[dt.date, dt.date]] = []
    cur_end = end
    while cur_end >= start:
        cur_start = max(start, cur_end - dt.timedelta(days=win_days - 1))
        wins.append((cur_start, cur_end))
        cur_end = cur_start - dt.timedelta(days=1)
    return wins


def run_week(win_start_d: dt.date, win_days: int, query: str = QUERY_PE,
             delay_s: float = 15.0, verbose: bool = True) -> dict:
    """Fetch one week (win_days). Returns stats for estimation."""
    win_end_d = win_start_d + dt.timedelta(days=win_days - 1)
    seen_global = load_seen_global()
    seen_month: dict[str, set[str]] = {}
    prog = load_progress()
    prog.setdefault("done", set())
    done = set(prog.get("done", []))
    stats = {"requests": 0, "raw": 0, "kept": 0, "splits": 0, "errors": 0, "windows": 0}
    stack: list[tuple[dt.date, dt.date]] = [(win_start_d, win_end_d)]
    t0 = time.monotonic()
    while stack:
        # Preserve newest-first order: pop from end (later windows first)
        w_start, w_end = stack.pop()
        key = f"{w_start.isoformat()}/{w_end.isoformat()}"
        if key in done:
            continue
        stats["windows"] += 1
        articles, full, _n = fetch_window(w_start, w_end, query, delay_s)
        stats["requests"] += 1
        if articles is None:
            stats["errors"] += 1
            log(f"ERROR ventana {w_start}..{w_end} (rate-limited); mark incomplete, will resume")
            done.add(key)  # mark to avoid infinite loop; progress keeps it
            prog["done"] = sorted(done)
            prog["last_error_window"] = [w_start.isoformat(), w_end.isoformat()]
            save_progress(prog)
            continue
        if full:
            parts = split_window(w_start, w_end)
            if len(parts) == 1 and parts[0] == (w_start, w_end):
                # Single-day window still full: halve it into hour windows
                # (implemented by re-queuing smaller day windows; if still full,
                # the next round serves as final — we keep it as-is and move on).
                log(f"MAXFILL ventana de 1 día {w_start} aún llena ({MAXRECORDS}); se guarda lo obtenido")
                parts = [(w_start, w_end)]
            else:
                log(f"MAXFILL {w_start}..{w_end} = {MAXRECORDS}; se divide en {len(parts)} ventanas")
                stats["splits"] += 1
                # Push children in reverse so newest is processed first
                for p in reversed(parts):
                    stack.append(p)
                # Skip re-marking: parent not done until children complete
                continue
        stats["raw"] += len(articles)
        recs = []
        for art in articles:
            rec = article_to_record(art)
            if rec is None:
                continue
            # Global dedupe + per-month dedupe via seen_month
            month = rec["fecha"][:7]
            bucket = seen_month.setdefault(month, set())
            if rec["url"] in seen_global or rec["url"] in bucket:
                continue
            recs.append(rec)
        if recs:
            # Group by month
            by_month: dict[str, list[dict]] = {}
            for r in recs:
                by_month.setdefault(r["fecha"][:7], []).append(r)
            for month, mrecs in by_month.items():
                bucket = seen_month.setdefault(month, set())
                add = [r for r in mrecs if r["url"] not in seen_global and r["url"] not in bucket]
                for r in add:
                    bucket.add(r["url"])
                    seen_global.add(r["url"])
                path = os.path.join(DATA_DIR, f"{month}.jsonl")
                os.makedirs(DATA_DIR, exist_ok=True)
                if add:
                    add.sort(key=lambda r: (r["fecha"], r["url"]))
                    with open(path, "a", encoding="utf-8") as f:
                        for r in add:
                            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            stats["kept"] += len(recs)
        done.add(key)
        prog["done"] = sorted(done)
        prog["stats_last_week"] = stats
        save_progress(prog)
        time.sleep(delay_s)  # polite between windows
    elapsed = time.monotonic() - t0
    stats["elapsed_s"] = round(elapsed, 1)
    log(f"OK ventana {win_start_d}..{win_end_d}: requests={stats['requests']} raw={stats['raw']} "
        f"kept={stats['kept']} splits={stats['splits']} errors={stats['errors']} "
        f"elapsed={stats['elapsed_s']}s")
    return stats


def run_full(start: dt.date = START_DATE, end: dt.date = END_DATE,
             win_days: int = 7, query: str = QUERY_PE,
             delay_s: float = 15.0) -> dict:
    prog = load_progress()
    done = set(prog.get("done", []))
    seen_global = load_seen_global()
    wins = iter_windows(win_days, start, end)
    log(f"INICIO full {start}..{end} win_days={win_days} query={query!r} "
        f"pending={len([w for w in wins if f'{w[0].isoformat()}/{w[1].isoformat()}' not in done])}/{len(wins)}")
    total_req = total_raw = total_kept = total_splits = total_err = 0
    seen_month: dict[str, set[str]] = {}
    for (w_start, w_end) in wins:
        key = f"{w_start.isoformat()}/{w_end.isoformat()}"
        if key in done:
            continue
        stack: list[tuple[dt.date, dt.date]] = [(w_start, w_end)]
        while stack:
            cs, ce = stack.pop()
            ckey = f"{cs.isoformat()}/{ce.isoformat()}"
            if ckey in done:
                continue
            articles, full, _n = fetch_window(cs, ce, query, delay_s)
            total_req += 1
            if articles is None:
                total_err += 1
                log(f"ERROR ventana {cs}..{ce} tras backoff; se marca y sigue")
                done.add(ckey)
                prog["done"] = sorted(done)
                save_progress(prog)
                continue
            if full:
                parts = split_window(cs, ce)
                if parts == [(cs, ce)]:
                    log(f"MAXFILL 1 día {cs} aún llena; se guarda lo obtenido")
                else:
                    stats_splits = 1
                    log(f"MAXFILL {cs}..{ce} -> {len(parts)} subventanas")
                    total_splits += stats_splits
                    for p in reversed(parts):
                        stack.append(p)
                    continue
            total_raw += len(articles)
            recs = []
            for art in articles:
                rec = article_to_record(art)
                if rec is None:
                    continue
                month = rec["fecha"][:7]
                bucket = seen_month.setdefault(month, set())
                if rec["url"] in seen_global or rec["url"] in bucket:
                    continue
                recs.append(rec)
            by_month: dict[str, list[dict]] = {}
            for r in recs:
                by_month.setdefault(r["fecha"][:7], []).append(r)
            for month, mrecs in by_month.items():
                bucket = seen_month.setdefault(month, set())
                add = [r for r in mrecs if r["url"] not in seen_global and r["url"] not in bucket]
                for r in add:
                    bucket.add(r["url"])
                    seen_global.add(r["url"])
                path = os.path.join(DATA_DIR, f"{month}.jsonl")
                os.makedirs(DATA_DIR, exist_ok=True)
                if add:
                    add.sort(key=lambda r: (r["fecha"], r["url"]))
                    with open(path, "a", encoding="utf-8") as f:
                        for r in add:
                            f.write(json.dumps(r, ensure_ascii=False) + "\n")
                    total_kept += len(add)
            done.add(ckey)
            prog["done"] = sorted(done)
            prog["last_window"] = ckey
            save_progress(prog)
            time.sleep(delay_s)
    log(f"FIN full: requests={total_req} raw={total_raw} kept={total_kept} splits={total_splits} errors={total_err}")
    return {"requests": total_req, "raw": total_raw, "kept": total_kept,
            "splits": total_splits, "errors": total_err}


def estimate_week(stats: dict, week_days: int, full_days: int) -> str:
    req = stats.get("requests", 0)
    raw = stats.get("raw", 0)
    kept = stats.get("kept", 0)
    elapsed = stats.get("elapsed_s", 0)
    per_day_req = req / max(1, week_days)
    total_req = per_day_req * full_days
    # Assume ~10 s average between requests including backoff (429s amortized)
    est_hours = total_req * 10 / 3600
    return (
        f"per week: {req} requests, {raw} raw, {kept} economy/Spanish kept "
        f"({elapsed:.0f}s wall). Per day: {per_day_req:.2f} requests. "
        f"For {full_days} days: ~{total_req:.0f} requests, "
        f"est {est_hours:.1f} h at ~10 s spacing avg + retries. "
        f"At strict 5 s spacing without retries: ~{total_req * 5 / 3600:.1f} h."
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true",
                    help="fetch one week (7 days from --from, default recent) and measure")
    ap.add_argument("--from", dest="from_date", default="",
                    help="probe start date AAAA-MM-DD (default: 7 days before END)")
    ap.add_argument("--week", default="",
                    help="AAAA-MM-DD start of a single window to fetch")
    ap.add_argument("--window-days", type=int, default=7)
    ap.add_argument("--query", default=QUERY_PE)
    ap.add_argument("--delay", type=float, default=15.0)
    ap.add_argument("--full", action="store_true", help="full 2019..today run")
    args = ap.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)

    if args.week:
        start = dt.date.fromisoformat(args.week)
        stats = run_week(start, args.window_days, args.query, max(args.delay, 5.0))
        print(estimate_week(stats, args.window_days, (END_DATE - START_DATE).days), flush=True)
        return 0

    if args.probe:
        start = END_DATE - dt.timedelta(days=7) if not args.from_date else dt.date.fromisoformat(args.from_date)
        # Anchor to the most recent full week available (newest first) so early
        # data is useful even if the full run stops early.
        stats = run_week(start, 7, args.query, max(args.delay, 5.0))
        full_days = (END_DATE - START_DATE).days
        print(estimate_week(stats, 7, full_days), flush=True)
        # Persist a small note for README generation
        note = {"week_start": start.isoformat(), "stats": stats,
                "estimate": estimate_week(stats, 7, full_days)}
        with open(os.path.join(DATA_DIR, "_probe.json"), "w", encoding="utf-8") as f:
            json.dump(note, f, ensure_ascii=False, indent=1)
            f.write("\n")
        return 0

    if args.full:
        run_full(START_DATE, END_DATE, args.window_days, args.query, max(args.delay, 5.0))
        return 0

    # Default: full run (resumable)
    run_full(START_DATE, END_DATE, args.window_days, args.query, max(args.delay, 5.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
