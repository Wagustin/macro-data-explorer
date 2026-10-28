"""Official, openly licensed market data for PerData (runs daily on GitHub Actions).

Writes to data/official/:
  eia-oil.json      WTI and Brent spot, daily (U.S. EIA, public domain, 17 U.S.C. 105)
  wb-metals.json    copper, gold, silver, zinc, WTI and Brent, monthly
                    (World Bank Pink Sheet, CC BY 4.0)
  sunat-fx.json     USD/PEN buy and sell published by SUNAT, one point per day,
                    accumulated from the day this job started (SUNAT only publishes today's rate)
  bcrp-daily.json   BCRP daily series: USD/PEN (SBS, sell) and international copper, gold,
                    silver, zinc and WTI quotes. Downloaded once a day here so the site never
                    calls the BCRP API on visitor requests (its API started showing a bot check).

Identified User-Agent, a few requests per day, nothing behind logins or bot checks.
Needs: xlrd, openpyxl.  Usage: python scripts/fetch_official.py
"""
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

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


WB_COLUMNS = {
    "Copper": "COBRE", "Gold": "ORO", "Silver": "PLATA", "Zinc": "ZINC",
    "Crude oil, WTI": "WTI", "Crude oil, Brent": "BRENT", "Platinum": "PLATINO",
    "Natural gas, US": "GAS_US", "Wheat, US HRW": "TRIGO", "Maize": "MAIZ",
    "Soybeans": "SOYA", "Sugar, world": "AZUCAR", "Cocoa": "CACAO",
    "Coffee, Arabica": "CAFE", "Aluminum": "ALUMINIO", "Tin": "ESTANO",
    "Nickel": "NIQUEL", "Lead": "PLOMO", "Iron ore, cfr spot": "MINERAL_HIERRO",
}


def wb_metals():
    page = get("https://www.worldbank.org/en/research/commodity-markets").decode("utf-8", "replace")
    link = re.search(r"https://thedocs\.worldbank\.org/[^\"']*CMO-Historical-Data-Monthly\.xlsx", page)
    if not link:
        raise RuntimeError("Banco Mundial: no se encontró el enlace del Pink Sheet mensual (¿cambió la página?)")
    wb = openpyxl.load_workbook(io.BytesIO(get(link.group(0))), read_only=True, data_only=True)
    rows = list(wb["Monthly Prices"].iter_rows(values_only=True))
    header_idx = next(i for i, r in enumerate(rows) if r and any(
        isinstance(v, str) and v.strip() == "Copper" for v in r))
    header, units = rows[header_idx], rows[header_idx + 1]
    cols = {}
    missing = []
    for expected, key in WB_COLUMNS.items():
        matches = [i for i, value in enumerate(header)
                   if isinstance(value, str) and value.strip() == expected]
        if matches:
            cols[key] = matches[0]
        else:
            missing.append((expected, key))
    if missing:
        raise RuntimeError("Banco Mundial: faltan columnas " + ", ".join(
            f"{key} (cabecera {header!r})" for _, key in missing))
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
        "licencia": "CC BY 4.0, Banco Mundial",
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


BCRP_SERIES = {
    "PEN": ("PD04640PD", "S/ por US$", 1),
    "COBRE": ("PD04701XD", "US$ por libra (Londres)", 0.01),  # published in US cents
    "ORO": ("PD04704XD", "US$ por onza troy (Londres)", 1),
    "PLATA": ("PD04702XD", "US$ por onza troy", 1),
    "ZINC": ("PD04703XD", "US$ por libra (Londres)", 0.01),
    "WTI": ("PD04705XD", "US$ por barril", 1),
}
BCRP_MONTHS = {"Ene": "01", "Feb": "02", "Mar": "03", "Abr": "04", "May": "05", "Jun": "06",
               "Jul": "07", "Ago": "08", "Set": "09", "Sep": "09", "Oct": "10", "Nov": "11", "Dic": "12"}


def bcrp_daily():
    end = dt.date.today()
    start = dt.date(2012, 1, 1)
    out = {}
    for name, (code, unit, scale) in BCRP_SERIES.items():
        raw = get(f"https://estadisticas.bcrp.gob.pe/estadisticas/series/api/{code}/json/{start}/{end}").decode("utf-8", "replace")
        if raw.lstrip().startswith("<"):
            raise RuntimeError(f"BCRP {code}: devolvió HTML (¿comprobación antibots?)")
        cut = raw[: raw.index("<")] if raw.find("<") > 0 else raw
        data = json.loads(cut[: cut.rindex("}") + 1])
        points = []
        for per in data.get("periods", []):
            m = re.match(r"^(\d{2})\.([A-Za-z]{3})\.(\d{2})$", per.get("name", ""))
            try:
                value = float(per["values"][0])
            except (ValueError, KeyError, IndexError):
                continue  # "n.d." (not yet published)
            if m and m.group(2) in BCRP_MONTHS:
                points.append([f"20{m.group(3)}-{BCRP_MONTHS[m.group(2)]}-{m.group(1)}", round(value * scale, 6)])
        if len(points) < 100:
            raise RuntimeError(f"BCRP {code}: solo {len(points)} datos")
        out[name] = {"codigo": code, "unidad": unit, "serie": points}
        time.sleep(6)  # one request every few seconds, once a day
    path = os.path.join(OUT, "bcrp-daily.json")
    payload = {
        "fuente": "Banco Central de Reserva del Perú (BCRP), estadísticas diarias",
        "url": "https://estadisticas.bcrp.gob.pe/estadisticas/series/",
        "licencia": "Información pública del BCRP, citando la fuente",
        "series": out,
    }
    encoded = json.dumps({**payload, "actualizado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) >= 1_500_000:
        raise RuntimeError(f"BCRP: archivo resultante demasiado grande ({len(encoded.encode('utf-8'))} bytes)")
    with open(path, "w", encoding="utf-8") as f:
        f.write(encoded + "\n")
    return "BCRP: " + ", ".join(f"{k} {len(v['serie'])} puntos {v['serie'][0][0]}–{v['serie'][-1][0]}" for k, v in out.items())


FED_SERIES = {
    # DDP series names, resolved against the H.10/H.15 release XML.
    "EURUSD": ("H10", "RXI$US_N.B.EU", "USD por EUR"),
    "USDJPY": ("H10", "RXI_N.B.JA", "JPY por USD"),
    "USDMXN": ("H10", "RXI_N.B.MX", "MXN por USD"),
    "USDBRL": ("H10", "RXI_N.B.BZ", "BRL por USD"),
    "USDCNY": ("H10", "RXI_N.B.CH", "CNY por USD"),
    "USDCAD": ("H10", "RXI_N.B.CA", "CAD por USD"),
    "USDCHF": ("H10", "RXI_N.B.SZ", "CHF por USD"),
    "GBPUSD": ("H10", "RXI$US_N.B.UK", "USD por GBP"),
    "AUDUSD": ("H10", "RXI$US_N.B.AL", "USD por AUD"),
    "DXY_AMPLIO": ("H10", "JRXWTFB_N.B", "Índice, enero de 1997 = 100"),
    "UST5Y": ("H15", "RIFLGFCY05_N.B", "% anual"),
    "UST10Y": ("H15", "RIFLGFCY10_N.B", "% anual"),
    "UST30Y": ("H15", "RIFLGFCY30_N.B", "% anual"),
}


def fed_rates():
    start = "2012-01-01"
    releases = {}
    for rel in ("H10", "H15"):
        url = f"https://www.federalreserve.gov/datadownload/Output.aspx?rel={rel}&filetype=zip"
        archive = zipfile.ZipFile(io.BytesIO(get(url)))
        xml_name = next(n for n in archive.namelist() if n.endswith("_data.xml"))
        releases[rel] = ET.fromstring(archive.read(xml_name))
        time.sleep(2)

    series = {}
    for key, (rel, series_id, _) in FED_SERIES.items():
        points = []
        for item in releases[rel].iter():
            if item.tag.rsplit("}", 1)[-1] != "Series" or item.attrib.get("SERIES_NAME") != series_id:
                continue
            for obs in item:
                if obs.tag.rsplit("}", 1)[-1] != "Obs":
                    continue
                day = obs.attrib.get("TIME_PERIOD", "")
                value = obs.attrib.get("OBS_VALUE", "")
                if day >= start and obs.attrib.get("OBS_STATUS") != "ND":
                    try:
                        points.append([day, float(value)])
                    except ValueError:
                        continue
        if not points:
            raise RuntimeError(f"Fed {rel}: serie DDP {series_id} sin datos desde {start}")
        series[key] = points
    payload = {
        "fuente": "Junta de la Reserva Federal de EE. UU., Data Download Program",
        "url": "https://www.federalreserve.gov/datadownload/",
        "licencia": "Dominio público: Junta de la Reserva Federal de EE. UU.",
        "unidades": {key: unit for key, (_, _, unit) in FED_SERIES.items()},
        "series": series,
    }
    save("fed-fx-rates.json", payload)
    return "Fed: " + ", ".join(f"{key} {len(points)} puntos {points[0][0]}–{points[-1][0]}" for key, points in series.items())


if __name__ == "__main__":
    errors = []
    for job in (bcrp_daily, eia_oil, wb_metals, sunat_fx, fed_rates):
        try:
            print(job())
        except Exception as e:  # one source failing must not block the others
            errors.append(f"{job.__name__}: {e}")
            print(f"ERROR {job.__name__}: {e}", file=sys.stderr)
    sys.exit(1 if errors else 0)
