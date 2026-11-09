# V7 D5 · eventos — event calendar that moves USD/PEN

Builds `~/v7/data/eventos/eventos.csv` (one row per verifiable event since 2005) plus
`~/v7/data/eventos/dias_evento.csv` (one row per business day with 0/1 covariates and
days-until-next-FOMC / BCRP). Nothing is added unless it carries a verifiable
`fuente_url`; anything else is recorded in `~/v7/data/eventos/_pendientes.md`.

> Convention note (read first): see `~/kathy_workspace/handoff/v7/CONVENCIONES.md`.
> Data/logs live outside git; this folder is the only git-tracked part.

## What it builds

| File | Location | Content |
|------|----------|---------|
| `eventos.csv` | `~/v7/data/eventos/` | `fecha,tipo,descripcion,fuente_url,fecha_disponible` (ISO AAAA-MM-DD UTC) |
| `dias_evento.csv` | `~/v7/data/eventos/` | one row per business day (Mon–Fri excl. Peru national holidays), 0/1 per event type + `dias_hasta_fomc`, `dias_hasta_bcrp` |
| `_pendientes.md` | `~/v7/data/eventos/` | deliberate exclusions (no verifiable source in this session) |
| `_licencias.md` | `~/v7/data/eventos/` | per-source licence / commercial-use note |
| `data/v7/eventos/eventos.csv` | repo (git) | compressed copy of `eventos.csv` for GitHub Actions, per CONVENCIONES |
| `research/v7/eventos/build_eventos.py` | repo (git) | the builder (this module) |

## How to run

```bash
# full rebuild (reuses cache if sources are unchanged)
~/v7-env/bin/python research/v7/eventos/build_eventos.py

# counts + range only, writes nothing
~/v7-env/bin/python research/v7/eventos/build_eventos.py --probe-only

# counts, writes nothing
~/v7-env/bin/python research/v7/eventos/build_eventos.py --dry-run
```

- Standard library only (`urllib, csv, datetime`): no pandas needed.
- Polite downloads: UA `PerDataBot/1.0 (+https://perdata.site)`, ~1.5 s between calls
  (BCRP per that policy), retries with backoff, resumable cache in
  `/tmp/opencode/eventos-cache/`, progress log at `~/v7/logs/eventos.log`.
- Validation after a run: `~/v7-env/bin/python -m py_compile research/v7/eventos/build_eventos.py`,
  then the section below.

## Event types (as of 2026-11-09 build)

| tipo | Rows | What it is | `fecha_disponible` |
|------|------|------------|--------------------|
| `fomc` | 168 | FOMC policy decisions (decision day = 2nd day of meeting) | same day |
| `fomc_notation` | 1 | FOMC notation votes (2025-08-22, 2020-03-18) | same day |
| `bcrp_tasa` | 81 | BCRP reference-rate EFFECTIVE changes (PD12301MD) | same day |
| `elecciones_pe_1v` / `elecciones_pe_2v` | 5 + 5 | Peru general elections, 1st round / runoff | convocation decree date |
| `vacancia_presidencial` | 1 | Castillo vacancy (2022-12-07) | same day |
| `disolucion_congreso` | 1 | 2019 dissolution (DS 165-2019-PCM) | same day |
| `feriado_pe` | 109 | Peru national holidays, gob.pe years 2018, 2019, 2021–2026 | Jan 1 of the year |
| `feriado_us` | 112 | US federal holidays, OPM ICS 2021–2030 | Jan 1 of the year |
| `fin_de_mes` | 262 | month-end calendar marker | same day |
| `fin_de_trimestre` | 87 | quarter-end calendar marker (Mar/Jun/Sep/Dec) | same day |

Total: 833 eventos, 5,623 business-day rows in `dias_evento.csv` (2005-01-03 … 2026-11-09).

## Rules that shaped the output (all verified live in this session)

- **No invented rows.** Minister changes, AFP-withdrawal laws, INEI CPI dates and the full
  BCRP hold calendar are excluded (see `_pendientes.md`) because no verifiable
  per-row source URL was reachable: BCRP pages are Incapsula-blocked, El Peruano norms
  404 from this client, INEI’s calendar is JS-only, and the MEF minister list has no
  tenure table in its live text.
- **FOMC decision date** = second day of the meeting range (2020’s emergency Mar 2 / Mar 15
  meetings and the Mar 18 notation vote are recorded separately).
- **BCRP rows are effective dates**, not meeting dates. Only rate changes advance the
  effective series, so holds have no API boundary to anchor to — that’s why the full
  monthly calendar is pending rather than fabricated.
- **Peru holidays** keep only official national holidays (“día no laborable” rows are
  dropped). gob.pe exposes only 2017–2026 and two of those years are page defects
  (2017 starts in July, 2020 is December-only), so both are excluded.
- **US holidays** ship only the OPM ICS range (2021–2030); 2005–2020 is pending for the
  same reason, never silently computed.

## Where the data feeds the models

`dias_evento.csv` is a drop-in covariate table: join on `fecha` to daily USD/PEN
series. All covariates are 0/1; the two `dias_hasta_*` columns are calendar-day
counts to the next scheduled/known meeting (empty only past the horizon).

## Monitoring

Progress log: `~/v7/logs/eventos.log` (fetch retries + write lines).
Cache: `/tmp/opencode/eventos-cache/` (deleting it forces a full polite re-fetch).
