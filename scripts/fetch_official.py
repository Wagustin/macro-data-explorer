"""Official, openly licensed market data for PerData (runs daily on GitHub Actions).

Writes to data/official/:
  eia-oil.json      WTI and Brent spot, daily (U.S. EIA, public domain, 17 U.S.C. 105)
  wb-metals.json    copper, gold, silver, zinc, WTI and Brent, monthly
                    (World Bank Pink Sheet, CC BY 4.0)
  sunat-fx.json     USD/PEN buy and sell published by SUNAT, one point per day,
                    accumulated from the day this job started (SUNAT only publishes today's rate)

Identified User-Agent, a few requests per day, nothing behind logins or bot checks.
Needs: xlrd, openpyxl.  Usage: python scripts/fetch_official.py
"""
import datetime as dt
import io
import json
import os
import re
import sys
import urllib.request

import openpyxl
import xlrd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "official")
UA = "PerDataBot/1.0 (+https://perdata.site)"


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def save(name, payload):
    os.makedirs(OUT, exist_ok=True)
    payload["actualizado"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


def eia_oil():
    book = xlrd.open_workbook(file_contents=get("https://www.eia.gov/dnav/pet/xls/PET_PRI_SPT_S1_D.xls"))
    sheet = book.sheet_by_name("Data 1")
    keys = sheet.row_values(1)
    if keys[1:3] != ["RWTC", "RBRTE"]:
        raise RuntimeError(f"EIA: columnas inesperadas {keys[:3]} (¿cambió el archivo?)")
    series = {"WTI": [], "BRENT": []}
    for r in range(3, sheet.nrows):
        row = sheet.row_values(r)
        if not isinstance(row[0], float):
            continue
        day = xlrd.xldate_as_datetime(row[0], book.datemode).date().isoformat()
        for col, name in ((1, "WTI"), (2, "BRENT")):
            if isinstance(row[col], float):
                series[name].append([day, row[col]])
    save("eia-oil.json", {
        "fuente": "U.S. Energy Information Administration (EIA), precios spot",
        "url": "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm",
        "licencia": "Dominio público (obra del Gobierno de EE. UU.)",
        "unidad": "US$ por barril",
        "series": series,
    })
    return f"EIA: WTI {series['WTI'][-1]}, Brent {series['BRENT'][-1]}"


WB_COLUMNS = {"Copper": "COBRE", "Gold": "ORO", "Silver": "PLATA", "Zinc": "ZINC",
              "Crude oil, WTI": "WTI", "Crude oil, Brent": "BRENT"}


def wb_metals():
    page = get("https://www.worldbank.org/en/research/commodity-markets").decode("utf-8", "replace")
    link = re.search(r"https://thedocs\.worldbank\.org/[^\"']*CMO-Historical-Data-Monthly\.xlsx", page)
    if not link:
        raise RuntimeError("Banco Mundial: no se encontró el enlace del Pink Sheet mensual (¿cambió la página?)")
    wb = openpyxl.load_workbook(io.BytesIO(get(link.group(0))), read_only=True, data_only=True)
    rows = list(wb["Monthly Prices"].iter_rows(values_only=True))
    header_idx = next(i for i, r in enumerate(rows) if r and "Copper" in r)
    header, units = rows[header_idx], rows[header_idx + 1]
    cols = {WB_COLUMNS[h]: i for i, h in enumerate(header) if h in WB_COLUMNS}
    if len(cols) != len(WB_COLUMNS):
        raise RuntimeError(f"Banco Mundial: faltan columnas {set(WB_COLUMNS.values()) - set(cols)}")
    series = {k: [] for k in cols}
    for r in rows[header_idx + 2:]:
        if not r or not isinstance(r[0], str) or not re.match(r"^\d{4}M\d{2}$", r[0]):
            continue
        month = f"{r[0][:4]}-{r[0][5:]}"
        for name, i in cols.items():
            if isinstance(r[i], (int, float)):
                series[name].append([month, float(r[i])])
    save("wb-metals.json", {
        "fuente": "Banco Mundial, Commodity Price Data (Pink Sheet)",
        "url": "https://www.worldbank.org/en/research/commodity-markets",
        "licencia": "CC BY 4.0",
        "unidades": {name: units[i] for name, i in cols.items()},
        "series": series,
    })
    return f"Banco Mundial: cobre {series['COBRE'][-1]}"


def sunat_fx():
    raw = get("https://www.sunat.gob.pe/a/txt/tipoCambio.txt").decode("latin-1").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})\|(\d+\.\d+)\|(\d+\.\d+)\|", raw)
    if not m:
        raise RuntimeError(f"SUNAT: formato inesperado: {raw[:60]!r}")
    day = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    path = os.path.join(OUT, "sunat-fx.json")
    store = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {
        "fuente": "SUNAT, tipo de cambio publicado",
        "url": "https://www.sunat.gob.pe/a/txt/tipoCambio.txt",
        "licencia": "Información pública del Estado peruano",
        "unidad": "S/ por US$",
        "serie": [],
    }
    point = [day, float(m.group(4)), float(m.group(5))]  # fecha, compra, venta
    store["serie"] = [p for p in store["serie"] if p[0] != day] + [point]
    store["serie"].sort()
    save("sunat-fx.json", store)
    return f"SUNAT: {point}"


if __name__ == "__main__":
    errors = []
    for job in (eia_oil, wb_metals, sunat_fx):
        try:
            print(job())
        except Exception as e:  # one source failing must not block the others
            errors.append(f"{job.__name__}: {e}")
            print(f"ERROR {job.__name__}: {e}", file=sys.stderr)
    sys.exit(1 if errors else 0)
