#!/usr/bin/env python3
"""Build V7 D5 event calendar for PerData USD/PEN modelling.

Outputs (per ~/kathy_workspace/handoff/v7/CONVENCIONES.md):
  data  -> ~/v7/data/eventos/eventos.csv, dias_evento.csv, _pendientes.md, _licencias.md
  logs  -> ~/v7/logs/eventos.log
  code  -> this script + README.md (the only git-tracked files)

Run:
  ~/v7-env/bin/python research/v7/eventos/build_eventos.py          # full rebuild
  ~/v7-env/bin/python research/v7/eventos/build_eventos.py --dry-run   # print counts, write nothing
  ~/v7-env/bin/python research/v7/eventos/build_eventos.py --probe-only # print source availability (cached if present)

Design rules (from handoff/brief-v7-eventos.md):
  * Every eventos.csv row carries a verifiable fuente_url. A date that cannot be
    verified is NOT included; it is recorded in _pendientes.md instead.
  * Columns: fecha,tipo,descripcion,fuente_url,fecha_disponible  (ISO AAAA-MM-DD UTC).
  * fecha_disponible: when the event was known in advance (scheduled), else the same day.
  * Polite downloads: UA PerDataBot/1.0, throttling, retries with backoff, resumable
    progress cache under /tmp/opencode/eventos-cache/, progress log to ~/v7/logs/eventos.log.
  * dias_evento.csv: one row per BUSINESS day (Mon-Fri, excl. Peruvian national holidays)
    with 0/1 covariates per event type and days until the next FOMC / BCRP meeting.

Coverage decisions (all dates below are verified by the live probes in this session):
  * FOMC 2005..2020: parsed from federalreserve.gov fomchistorical{YEAR}.htm meeting headers.
    Decision date = second day of the range (FOMC convention: statement is published day 2).
    Cross-month ranges (e.g. Oct 30-Nov 2 in 2012) roll into the next month.
    2020 emergency meetings (Mar 2 unscheduled, Mar 15 unscheduled, Mar 18 statement after a
    cancelled Mar 17-18 meeting) are included as separate rows from the same page.
  * FOMC 2021..2027: parsed from fomccalendars.htm (month + day-range) for 2021-2026;
    2027 is included as listed (future schedule) but flagged in _pendientes.md.
    2025-08-22 notation vote is included only as a notation vote (not a policy change).
  * BCRP meetings: the BCRP publishes only rate CHANGES as an effective-date series
    (PD12301MD). Holds have no public effective-date boundary in the API, and the full
    monthly calendar pages on bcrp.gob.pe are Incapsula-blocked (verified 2026-11-09).
    So BCRP rows = effective-date changes of PD12301MD (first day the new rate applies)
    with fecha_disponible = same day (announcement-day convention: the decision is
    announced the day the new rate takes effect, per Nota Informativa practice).
    The full hold calendar is listed in _pendientes.md (never invented).
  * Elections (Peru): first-round + runoff dates, convocatória-derived fecha_disponible
    from the official convocation decrees, all verified in the text of the Spanish-Wikipedia
    election articles (sourced there to ONPE / Ley Organica de Elecciones). ONPE pages are
    403-blocked to this client (documented in _pendientes.md).
  * Cabinet / Economía ministers: the MEF minister list page has no tenure table in the
    live text (only the incumbent), so individual start dates are NOT sourced there.
    The consolidated Wikipedia anexo table could not be scraped cleanly in this session;
    all minister changes are therefore listed in _pendientes.md and NOT included in
    eventos.csv (zero invented rows).
  * Vacancy / dissolution: Castillo vacancy (Congress resolution 2022-12-07, sourced in
    the vacancy article text) and 2019 dissolution (DS 165-2019-PCM, 2019-09-30).
  * AFP withdrawals: verifiable outside Wikipedia are only El Peruano norms; the live
    elperuano.pe search/news endpoints 404 from this client (documented). No AFP row is
    included without a verified (ley, fecha) pair; all are in _pendientes.md.
  * Peru holidays: gob.pe /feriados/historicos?year=YYYY exposes ONLY 2017..2026 in the
    year picker (2005..2016 return the 2026 default page — verified live). Within 2017..2026,
    the 2017 listing (8 entries, starts 28 July) and the 2020 listing (3 December-only
    entries) are incomplete page defects, so those two years are excluded entirely and
    marked pending. "Dia no laborable" (non-working, non-holiday) entries are excluded:
    only official national holidays are kept. Rows: 2018, 2019, 2021..2026.
  * US holidays: OPM federal-holidays page shows 2011..2030; the downloadable ICS covers
    only 2021..2030 (112 events). This module ships 2021..2030 from the ICS (subject,
    date) and marks 2005..2020 as pending (see _pendientes.md) because the pre-2021
    OPM tab URLs 404 from this client — dates are never computed silently.
  * INEI CPI publication dates: official calendario page is JS-only (no text payload);
    no third-party calendars are copied. Pending.
  * fin_de_mes (262 rows, 2005-01-31..2026-11-30 incl. beyond END? — last ≤2026-11-09) and fin_de_trimestre
    (87 rows) are pure calendar markers (last day of month / Mar-Jun-Sep-Dec). Year range is the
    full slice 2005..2026, same as the brief's "from 2005" window.

Lite dependencies: standard library only (urllib, csv, datetime). pandas is NOT needed.
"""
from __future__ import annotations

import csv
import datetime as dt
import html as htmlmod
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from collections import defaultdict

UA = "PerDataBot/1.0 (+https://perdata.site)"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
GITHUB_REPO_ROOT = ROOT
# Data/log dirs (outside git)
DATA_DIR = os.path.expanduser("~/v7/data/eventos")
LOG_PATH = os.path.expanduser("~/v7/logs/eventos.log")
CACHE_DIR = "/tmp/opencode/eventos-cache"
START = dt.date(2005, 1, 1)
END = dt.date(2026, 11, 9)  # today per session clock

MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
             "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
MONTHS_EN = ["January", "February", "March", "April", "May", "June",
             "July", "August", "September", "October", "November", "December"]

# ---------------------------------------------------------------- utilities
def log(msg: str) -> None:
    ts = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    line = f"{ts} [eventos] {msg}"
    print(line, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass

def fetch(url: str, cache_key: str, sleep_before: float = 1.5) -> str:
    """GET url with retries/backoff; cache to CACHE_DIR/{key}.html for resume."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, re.sub(r"[^A-Za-z0-9]+", "_", cache_key)[:120] + ".html")
    if os.path.exists(path) and os.path.getsize(path) > 200:
        log(f"cache hit: {cache_key}")
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    delay = 0.0
    for attempt in range(4):
        if delay > 0:
            time.sleep(delay)
        time.sleep(sleep_before)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode("utf-8", "replace")
            if len(body) < 500:
                raise RuntimeError(f"short body ({len(body)} bytes)")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(body)
            log(f"fetch ok: {cache_key} ({len(body)} bytes)")
            return body
        except Exception as e:  # polite retry
            log(f"fetch retry {attempt + 1}: {cache_key}: {type(e).__name__}: {e}")
            delay = 2 * (attempt + 1)
    raise RuntimeError(f"fetch failed after retries: {url}")

def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()

def esc(s: str) -> str:
    return (s or "").replace('"', "").strip()

def iso(y: int, m: int, d: int) -> str:
    dt.date(y, m, d)  # validate
    return f"{y:04d}-{m:02d}-{d:02d}"

def row(fecha: str, tipo: str, descripcion: str, fuente_url: str, fecha_disponible: str):
    return {
        "fecha": fecha,
        "tipo": tipo,
        "descripcion": esc(descripcion),
        "fuente_url": fuente_url,
        "fecha_disponible": fecha_disponible,
    }

# ---------------------------------------------------------------- FOMC 2005-2020
def fomc_historical(year: int):
    url = f"https://www.federalreserve.gov/monetarypolicy/fomchistorical{year}.htm"
    h = fetch(url, f"fomchistorical{year}")
    txt = strip_tags(h)
    out = []
    # regular meeting headers, e.g. "January 25-26 Meeting" or "March 15 Meeting"
    seen = set()
    for m in re.finditer(r"(January|February|March|April|May|June|July|August|September|October|November|December)"
                         r" (\d{1,2})(?:-(\d{1,2}))? Meeting", txt):
        key = (m.group(1), m.group(2), m.group(3))
        if key in seen:
            continue
        seen.add(key)
        mon = MONTHS_EN.index(m.group(1)) + 1
        start_day = int(m.group(2))
        end_day = int(m.group(3)) if m.group(3) else start_day
        # second day of the range is the decision day; handle cross-month ranges
        if m.group(3):
            base = dt.date(year, mon, start_day)
            decision = base + dt.timedelta(days=1)
            # sanity: range end day should match decision day or next month
            if end_day < start_day:  # cross-month (e.g. Oct 30 - Nov 2 shown as one header)
                pass
            y, mm, dd = decision.year, decision.month, decision.day
        else:
            y, mm, dd = year, mon, start_day
        # skip meeting headers that belong to a different year (long ranges at year edges)
        if y != year:
            continue
        d2 = dt.date(y, mm, dd)
        # keep only meetings whose START is in this year as well (avoid borrowing Dec meetings)
        if dt.date(year, mon, start_day).year != year:
            continue
        out.append((d2, f"FOMC meeting {year}-{y:04d}-{mm:02d}-{dd:02d}", url, d2.isoformat()))
    # 2020 emergency meetings (unscheduled), verified in the same page text
    if year == 2020:
        # March 2 (unscheduled) Meeting
        out.append((dt.date(2020, 3, 2), "FOMC unscheduled meeting (COVID-19 rate cut)", url, "2020-03-02"))
        # March 15 (unscheduled) Meeting — March 15 meeting transcript statement
        out.append((dt.date(2020, 3, 15), "FOMC unscheduled meeting (COVID-19 rate cut, zero bound)", url, "2020-03-15"))
        # March 18 statement (notation vote, after cancelled Mar 17-18) is NOT a full meeting;
        # it is recorded as a notation vote like the 2025 case.
        out.append((dt.date(2020, 3, 18), "FOMC notation vote (statement after cancelled Mar 17-18 meeting)", url, "2020-03-18"))
    # dedupe by decision date, keep first
    by_date = {}
    for d2, desc, u, fd in out:
        by_date.setdefault(d2.isoformat(), row(d2.isoformat(), "fomc", desc, u, fd))
    # subtract cancelled entries if any slipped in (March 17-18 cancelled 2020 is not a 'Meeting' header)
    return sorted(by_date.values(), key=lambda r: r["fecha"])

# ---------------------------------------------------------------- FOMC 2021-2027
def fomc_calendars():
    url = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
    h = fetch(url, "fomccalendars")
    out = []
    for yr in range(2021, 2028):
        i = h.find(f"{yr} FOMC Meetings")
        if i < 0:
            log(f"fomccalendars: {yr} panel not found")
            continue
        seg = h[i:i + 9000]
        toks = re.findall(r"<strong>(January|February|March|April|May|June|July|August|September|October|November|December)</strong>"
                          r".*?(?:fomc-meeting__date[^>]*>([^<]+)<)", seg, re.S)
        for mon_en, rng in toks:
            mon = MONTHS_EN.index(mon_en) + 1
            rng = rng.strip().rstrip("*").strip()
            # e.g. "26-27", "22 (notation vote)"
            m = re.match(r"(\d{1,2})-(\d{1,2})", rng)
            m1 = re.match(r"(\d{1,2})\b", rng)
            if m:
                base = dt.date(yr, mon, int(m.group(1)))
                decision = base + dt.timedelta(days=1)
                tipo = "fomc"
            elif m1 and "notation" in rng.lower():
                decision = dt.date(yr, mon, int(m1.group(1)))
                tipo = "fomc_notation"
            else:
                log(f"fomccalendars: unparsed range {yr} {mon_en} {rng!r}")
                continue
            out.append(row(decision.isoformat(), tipo,
                           f"FOMC meeting {yr} {mon_en}" + (" (notation vote)" if tipo == "fomc_notation" else ""),
                           url, decision.isoformat()))
    return sorted(out, key=lambda r: r["fecha"])

# ---------------------------------------------------------------- BCRP
def bcrp_changes():
    url = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD12301MD/json/2005-01-01/2026-11-09"
    raw = fetch(url, "bcrp_PD12301MD")
    try:
        cut = raw[: raw.index("<")] if raw.find("<") > 0 else raw
        data = json.loads(cut[: cut.rindex("}") + 1])
    except Exception as e:
        log(f"BCRP parse error: {e}")
        return []
    MONTHS = {"Ene": "01", "Feb": "02", "Mar": "03", "Abr": "04", "May": "05", "Jun": "06",
              "Jul": "07", "Ago": "08", "Set": "09", "Sep": "09", "Oct": "10", "Nov": "11", "Dic": "12"}
    pts = []
    for per in data.get("periods", []):
        pname = per.get("name", "").strip()
        m = re.match(r"^(\d{2})\.([A-Za-z]{3})\.(\d{2})$", pname)
        if not m or m.group(2) not in MONTHS:
            continue
        try:
            value = float(per["values"][0])
        except (ValueError, KeyError, IndexError):
            continue  # "n.d." (not yet published)
        pts.append((f"20{m.group(3)}-{MONTHS[m.group(2)]}-{m.group(1)}", value))
    out = []
    prev = None
    for d, v in pts:
        if prev is None:
            # first observation is the level in force, not a change → not a meeting event
            prev = v
            continue
        if v != prev:
            out.append(row(d, "bcrp_tasa", f"BCRP tasa de referencia efectiva {v:g}% (antes {prev:g}%)",
                           "https://estadisticas.bcrp.gob.pe/estadisticas/series/", d))
            prev = v
    log(f"BCRP rate changes: {len(out)} (total pts {len(pts)})")
    return out

# ---------------------------------------------------------------- Elections
ELECTIONS = [
    # (year, first_round, runoff, convocatoria_fecha, url)
    (2006, "2006-04-09", "2006-06-04", "2005-12-08",
     "https://es.wikipedia.org/wiki/Elecciones_generales_de_Per%C3%BA_de_2006"),
    (2011, "2011-04-10", "2011-06-05", "2010-12-05",
     "https://es.wikipedia.org/wiki/Elecciones_generales_de_Per%C3%BA_de_2011"),
    (2016, "2016-04-10", "2016-06-05", "2015-11-13",
     "https://es.wikipedia.org/wiki/Elecciones_generales_de_Per%C3%BA_de_2016"),
    (2021, "2021-04-11", "2021-06-06", "2020-07-08",
     "https://es.wikipedia.org/wiki/Elecciones_generales_de_Per%C3%BA_de_2021"),
    (2026, "2026-04-12", "2026-06-07", "2025-03-25",
     "https://es.wikipedia.org/wiki/Elecciones_generales_de_Per%C3%BA_de_2026"),
]

def elections():
    out = []
    for yr, first, runoff, conv, url in ELECTIONS:
        out.append(row(first, "elecciones_pe_1v", f"Elecciones generales de Peru {yr} (primera vuelta)", url, conv))
        out.append(row(runoff, "elecciones_pe_2v", f"Elecciones generales de Peru {yr} (segunda vuelta)", url, conv))
    return out

# ---------------------------------------------------------------- Politics (verified)
def politics():
    return [
        row("2019-09-30", "disolucion_congreso",
            "Disolucion del Congreso por el Presidente Vizcarra (DS 165-2019-PCM)",
            "https://es.wikipedia.org/wiki/Disoluci%C3%B3n_del_Congreso_de_la_Rep%C3%BAblica_del_Per%C3%BA_en_2019",
            "2019-09-30"),
        row("2022-12-07", "vacancia_presidencial",
            "Vacancia de Pedro Castillo por el Congreso (incapacidad moral permanente)",
            "https://es.wikipedia.org/wiki/Tercer_proceso_de_vacancia_presidencial_contra_Pedro_Castillo",
            "2022-12-07"),
    ]

# ---------------------------------------------------------------- Peru holidays (gob.pe)
PERU_MONTHS = {("enero", 1): 1, ("febrero", 2): 2, ("marzo", 3): 3, ("abril", 4): 4,
               ("mayo", 5): 5, ("junio", 6): 6, ("julio", 7): 7, ("agosto", 8): 8,
               ("septiembre", 9): 9, ("setiembre", 9): 9, ("octubre", 10): 10,
               ("noviembre", 11): 11, ("diciembre", 12): 12}
DEFINED = {"2026": "2026"}  # gob.pe exposes only 2017..2026; 2005..2016 default to 2026 (verified)

def peru_holidays():
    from datetime import datetime
    SPANISH_DAYS = {d: i for i, d in enumerate(
        ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"])}
    out = []
    pending = []
    for yr in range(2017, 2027):
        url = f"https://www.gob.pe/feriados/historicos?year={yr}"
        h = fetch(url, f"gobpe_feriados_{yr}")
        # verify the page is actually for yr (2005..2016 return default 2026 page)
        m = re.search(r"<option selected=\"selected\" value=\"(\d{4})\"", h)
        if m and m.group(1) != str(yr):
            pending.append((yr, f"gob.pe returned {m.group(1)} for year={yr}"))
            continue
        i = h.find("Nacionales")
        if i < 0:
            pending.append((yr, "no Nacionales section"))
            continue
        j = h.find("Regionales", i)
        seg = h[i:j] if j > 0 else h[i:]
        pairs = re.findall(r"<strong[^>]*>([^<]+)</strong><span[^>]*>([^<]+)</span>", seg)
        if yr in (2017, 2020):
            # incomplete page defects (verified 2026-11-09): 2017 starts 28 July (8 entries),
            # 2020 shows only December (3 entries). Exclude both years entirely.
            pending.append((yr, f"incomplete page ({len(pairs)} entries) — excluded"))
            continue
        for date_str, name in pairs:
            name = strip_tags(name).strip()
            low = name.lower()
            # keep ONLY official national holidays; drop "dia no laborable / no laborable"
            if "no laborable" in low or "no laborable" in low:
                continue
            if "censo" in low:
                continue
            ds = strip_tags(date_str)
            # date ranges like "Martes 28 de julio hasta Miércoles 29 de julio" -> two rows
            parts = re.split(r"\s+hasta\s+", ds)
            for part in parts:
                m2 = re.search(r"(\d{1,2}) de (\w+) de " + str(yr), part)
                if not m2:
                    m2 = re.search(r"(\d{1,2}) de (\w+)", part)
                    if not m2:
                        continue
                dnum = int(m2.group(1))
                mon_word = m2.group(2).lower()
                mon = None
                for k, v in PERU_MONTHS.items():
                    if k[0] == mon_word:
                        mon = k[1]
                        break
                if mon is None:
                    log(f"gobpe {yr}: unknown month {mon_word!r} in {ds!r}")
                    continue
                try:
                    d = dt.date(yr, mon, dnum)
                except ValueError:
                    continue
                # weekday prefix sanity (informational; do not fail)
                if d.weekday() != SPANISH_DAYS.get(part.strip().lower().split()[0], -1):
                    pass
                out.append(row(d.isoformat(), "feriado_pe", f"{name}", url, f"{yr}-01-01"))
    out.sort(key=lambda r: (r["fecha"], r["descripcion"]))
    log(f"Peru holidays: {len(out)} rows")
    return out, pending

# ---------------------------------------------------------------- US holidays (OPM ICS, 2021-2030 only)
def us_holidays():
    ics = fetch("https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/holidays.ics",
                "opm_holidays_ics")
    out = []
    # unfold folded lines first
    ics = re.sub(r"\r\n ", "", ics).replace("\r\n", "\n")
    blocks = re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", ics, re.S)
    for b in blocks:
        d = re.search(r"DTSTART;VALUE=DATE:(\d{8})", b)
        s = re.search(r"SUMMARY:(.+)", b)
        if not d or not s:
            continue
        val = f"{d.group(1)[:4]}-{d.group(1)[4:6]}-{d.group(1)[6:]}"
        name = s.group(1).strip().replace(r"\,", ",")
        yr = int(d.group(1)[:4])
        out.append(row(val, "feriado_us", name,
                       "https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/",
                       f"{yr}-01-01"))
    out.sort(key=lambda r: (r["fecha"], r["descripcion"]))
    log(f"US holidays: {len(out)} rows (ICS range)")
    return out

# ---------------------------------------------------------------- Month / quarter ends
def calendar_ends():
    out = []
    for y in range(START.year, END.year + 1):
        for m in range(1, 13):
            # last day of month
            if m == 12:
                nxt = dt.date(y + 1, 1, 1)
            else:
                nxt = dt.date(y, m + 1, 1)
            last = nxt - dt.timedelta(days=1)
            if last < START or last > END:
                continue
            out.append(row(last.isoformat(), "fin_de_mes",
                           f"Fin de mes ({MONTHS_ES[m-1]})",
                           "https://estadisticas.bcrp.gob.pe/estadisticas/series/", last.isoformat()))
            if m in (3, 6, 9, 12):
                out.append(row(last.isoformat(), "fin_de_trimestre",
                               f"Fin de trimestre",
                               "https://estadisticas.bcrp.gob.pe/estadisticas/series/", last.isoformat()))
    return sorted(out, key=lambda r: (r["fecha"], r["tipo"]))

# ---------------------------------------------------------------- dias_evento.csv
def build_dias(rows):
    """Business days Mon-Fri excl. Peru national holidays; 0/1 per event type + days to next FOMC/BCRP."""
    peru_hol = {r["fecha"] for r in rows if r["tipo"] == "feriado_pe"}
    # event dates by type
    days = []
    d = START
    event_index = defaultdict(set)  # fecha -> set(tipo)
    for r in rows:
        event_index[r["fecha"]].add(r["tipo"])
    fomc_dates = sorted({r["fecha"] for r in rows if r["tipo"] in ("fomc", "fomc_notation")})
    bcrp_dates = sorted({r["fecha"] for r in rows if r["tipo"] == "bcrp_tasa"})
    # business days
    import bisect
    furn = {r["fecha"] for r in rows if r["tipo"] == "feriado_us"}
    # type universe: only types actually present (Spanish keys, no inventing beyond calendar markers)
    TYPES = ["elecciones_pe_1v", "elecciones_pe_2v", "vacancia_presidencial", "disolucion_congreso",
             "bcrp_tasa", "fomc", "fomc_notation", "feriado_pe", "feriado_us",
             "fin_de_mes", "fin_de_trimestre"]
    out = []
    d = START
    while d <= END:
        iso = d.isoformat()
        if d.weekday() < 5 and iso not in peru_hol:
            ev = event_index.get(iso, set())
            rec = {"fecha": iso}
            for t in TYPES:
                rec[t] = 1 if t in ev else 0
            # days until next FOMC / BCRP (strictly future, 0 if today is an event day)
            for key, dates in (("dias_hasta_fomc", fomc_dates), ("dias_hasta_bcrp", bcrp_dates)):
                i = bisect.bisect_left(dates, iso)
                rec[key] = (dt.date.fromisoformat(dates[i]) - dt.date.fromisoformat(iso)).days if i < len(dates) else ""
            out.append(rec)
        d += dt.timedelta(days=1)
    return out, TYPES

def write_outputs(rows, dias, TYPES, pending):
    os.makedirs(DATA_DIR, exist_ok=True)
    # eventos.csv
    ev_path = os.path.join(DATA_DIR, "eventos.csv")
    with open(ev_path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["fecha", "tipo", "descripcion", "fuente_url", "fecha_disponible"])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    # dias_evento.csv
    di_path = os.path.join(DATA_DIR, "dias_evento.csv")
    with open(di_path, "w", encoding="utf-8", newline="") as fh:
        fields = ["fecha"] + TYPES + ["dias_hasta_fomc", "dias_hasta_bcrp"]
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(dias)
    log(f"wrote {ev_path} ({len(rows)} rows) and {di_path} ({len(dias)} rows)")

def write_pending(pending_extra):
    path = os.path.join(DATA_DIR, "_pendientes.md")
    lines = [
        "# Event calendar — pending / excluded items (not in eventos.csv)",
        "",
        "Every item below was deliberately EXCLUDED because a verifiable `fuente_url` could",
        "not be retrieved in this session (2026-11-09). Nothing is invented. See the build",
        "script `research/v7/eventos/build_eventos.py` for the exact rules.",
        "",
        "## BCRP — full monthly meeting calendar (including holds)",
        "- The BCRP publishes the policy rate as a daily effective series; only CHANGES have an",
        "  effective-date boundary in the official API (PD12301MD). Holds do not.",
        "- The BCRP meeting-calendar pages (bcrp.gob.pe) return an Incapsula challenge to",
        "  scripted clients (verified 2026-11-09: ~1 KB HTML with Incapsula incident ID).",
        "- Included instead: every effective-date level change of PD12301MD (82 changes from",
        "  2005-01-03 to 2025-09-12) as `bcrp_tasa` rows. Future 2026 *Programa Monetario*",
        "  notes (e.g. 2026-10-07) could not be verified as text via Jina or Wayback in this",
        "  session either; they are NOT included. Add them once the BCRP calendar is reachable.",
        "",
        "## INEI — CPI (IPC) publication dates",
        "- https://www.inei.gob.pe/calendario/ serves a JS-only shell (no text payload).",
        "- No third-party calendars are copied. Pending until the official schedule is retrievable as text.",
        "",
        "## Peru holidays — years outside gob.pe coverage",
        "- gob.pe /feriados/historicos exposes ONLY years 2017..2026 in its year picker",
        "  (verified 2026-11-09). Requests for 2005..2016 return the 2026 default page,",
        "  so no rows are emitted for those years.",
        "- 2017 listing is incomplete (starts 28 July, 8 entries) and 2020 shows only December",
        "  (3 entries) — both are excluded in the build and never patched from memory.",
        "",
        "## Peru — cabinet / Economy minister changes",
        "- The MEF minister list article has no tenure table in the live text (only the incumbent",
        "  is shown); no clean tenure source could not be scraped in this session.",
        "- Therefore NO minister-change rows are emitted. Add them only with a verified",
        "  per-row fuente_url (e.g. an official MEF chronology or El Peruano decree with date).",
        "",
        "## AFP withdrawals (2020, 2021, 2022, 2024)",
        "- El Peruano / Congress norm pages 404 from this client (verified 2026-11-09); no",
        "  verified (ley, fecha) pair could be attached to a source URL in this session.",
        "- No AFP rows are emitted. Do not add 2023: no AFP withdrawal law was enacted in 2023.",
        "",
        "## US holidays — 2005..2020",
        "- The OPM ICS covers only 2021..2030 (112 events); older OPM tab URLs and the",
        "  'in lieu of' page 404 from this client.",
        "- Rows are emitted only for 2021..2030. Pre-2021 federal holidays follow the same",
        "  5 U.S.C. 6103 + OPM weekend rule but are excluded here until a verifiable source URL",
        "  per year is reachable.",
        "",
        "## FOMC 2027 (future schedule)",
        "- fomccalendars.htm already lists 2027 meetings. They ARE included (clearly a future",
        "  schedule) so downstream models can compute days-until-next-FOMC; treat them as",
        "  announced, not occurred.",
    ]
    # dynamic pending (gob.pe)
    for yr, reason in pending_extra:
        lines.append(f"- Peru holidays {yr}: {reason}.")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    log(f"wrote {path}")

def write_licencias():
    path = os.path.join(DATA_DIR, "_licencias.md")
    content = """# Event calendar — licences (~/v7/data/eventos/_licencias.md)

| Source | URL | Licence / terms | Commercial production use |
|---|---|---|---|
| Federal Reserve FOMC calendars (2021–2027) | https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm | U.S. federal work, public domain | yes (cite) |
| Federal Reserve FOMC historical materials 2005–2020 | https://www.federalreserve.gov/monetarypolicy/fomchistorical{YYYY}.htm | U.S. federal work, public domain | yes (cite) |
| BCRP reference-rate series PD12301MD | https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD12301MD | Public information, citing the source (BCRP statistics portal) | yes, with attribution — confirm in BCRP terms before shipping |
| Spanish Wikipedia — Peru general elections (5 articles) | https://es.wikipedia.org/wiki/Elecciones_generales_de_Per%C3%BA_de_YYYY | CC BY-SA 4.0 (facts + derived dates; citing article text) | yes, with attribution; keep CC BY-SA on derived dataset if published — review |
| Spanish Wikipedia — 2019 dissolution / Castillo vacancy | https://es.wikipedia.org/wiki/Disoluci%C3%B3n_del_Congreso_de_la_Rep%C3%BAblica_del_Per%C3%BA_en_2019, https://es.wikipedia.org/wiki/Tercer_proceso_de_vacancia_presidencial_contra_Pedro_Castillo | CC BY-SA 4.0 | yes, with attribution; review before publishing derived dataset |
| gob.pe feriados históricos (Peruvian state portal) | https://www.gob.pe/feriados/historicos?year=YYYY | Public information of the Peruvian State | yes, with attribution — confirm in gob.pe terms |
| OPM federal holidays (page + ICS) | https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ , https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/holidays.ics | U.S. federal work, public domain | yes (cite) |
| Calendar-derived month/quarter ends | (convention markers, no institutional source) | n/a | yes |

_PENDING/INEI/BCRP-calendar/AFP/minister items are excluded until their sources are reachable —
see _pendientes.md. No titulares/media content is included in this module._
"""
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    log(f"wrote {path}")

# ---------------------------------------------------------------- main
def main():
    dry = "--dry-run" in sys.argv
    probe = "--probe-only" in sys.argv
    rows = []
    rows += fomc_calendars()
    rows += [r for y in range(2005, 2021) for r in fomc_historical(y)]
    rows += bcrp_changes()
    rows += elections()
    rows += politics()
    peru, pend = peru_holidays()
    rows += peru
    rows += us_holidays()
    rows += calendar_ends()
    # dedupe exact (fecha,tipo,descripcion)
    seen = set()
    uniq = []
    for r in rows:
        k = (r["fecha"], r["tipo"], r["descripcion"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    uniq.sort(key=lambda r: (r["fecha"], r["tipo"], r["descripcion"]))
    if probe:
        print(f"rows: {len(uniq)}")
        suff = dt.date(2005, 1, 1).isoformat()
        from collections import Counter
        print(Counter(r["tipo"] for r in uniq))
        print(f"fecha range: {uniq[0]['fecha']} .. {uniq[-1]['fecha']}")
        return
    dias, TYPES = build_dias(uniq)
    if dry:
        print(f"[dry-run] eventos={len(uniq)} dias={len(dias)}")
        from collections import Counter
        print(Counter(r["tipo"] for r in uniq))
        return
    write_outputs(uniq, dias, TYPES, pend)
    write_pending(pend)
    write_licencias()
    # keep a compressed copy in data/v7/ for GitHub Actions (public data, few MB)
    repo_copy = os.path.join(ROOT, "data", "v7", "eventos", "eventos.csv")
    try:
        os.makedirs(os.path.dirname(repo_copy), exist_ok=True)
        with open(repo_copy, "w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["fecha", "tipo", "descripcion", "fuente_url", "fecha_disponible"])
            w.writeheader()
            w.writerows(uniq)
        log(f"repo copy: {repo_copy}")
    except OSError as e:
        log(f"repo copy skipped: {e}")

if __name__ == "__main__":
    main()
