"""Download the open monthly Economic Policy Uncertainty indices."""
import datetime as dt
import io
import json
import os
import re
import urllib.request

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "official", "epu.json")
UA = "PerDataBot/1.0 (+https://perdata.site)"
SOURCES = {
    "GLOBAL": ("https://www.policyuncertainty.com/media/Global_Policy_Uncertainty_Data.xlsx", "GEPU_current"),
    "USA": ("https://www.policyuncertainty.com/media/US_Policy_Uncertainty_Data.xlsx", "USEPU_current"),
    "LATAM": ("https://www.bde.es/f/webbe/SES/AnalisisEconomico/AnalisisEconomico/America_latina/Publicaciones/EPU_LATAM.xlsx", None),
}


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def month(value):
    if isinstance(value, dt.datetime):
        return value.strftime("%Y-%m")
    if isinstance(value, dt.date):
        return value.strftime("%Y-%m")
    if isinstance(value, (int, float)):
        # Excel monthly dates are stored as dates in these workbooks; reject serials.
        return None
    s = str(value).strip()
    m = re.search(r"(\d{4})[-/. M](\d{1,2})$", s, re.IGNORECASE)
    if m and 1 <= int(m.group(2)) <= 12:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    m = re.search(r"^(\d{1,2})[-/.](\d{4})$", s)
    if m and 1 <= int(m.group(1)) <= 12:
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    return None


def parse(data, expected):
    book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    for sheet in book.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        for header_index, header in enumerate(rows):
            labels = [str(v).strip() if v is not None else "" for v in header]
            candidates = ([i for i, value in enumerate(labels)
                           if value.casefold() in {"peru", "perú", "epu_per_local"}]
                          if expected is None else
                          [i for i, value in enumerate(labels) if value.casefold() == expected.casefold()])
            if not candidates:
                continue
            value_col = candidates[0]
            date_cols = [i for i, value in enumerate(labels)
                         if value.casefold() in {"month", "date", "year-month", "period", "fecha"}]
            year_cols = [i for i, value in enumerate(labels) if value.casefold() in {"year", "año"}]
            month_cols = [i for i, value in enumerate(labels) if value.casefold() in {"month", "mes"}]
            date_col = date_cols[0] if date_cols else 0
            points = []
            for data_row in rows[header_index + 1:]:
                try:
                    key = (f"{int(data_row[year_cols[0]]):04d}-{int(data_row[month_cols[0]]):02d}"
                           if year_cols and month_cols else month(data_row[date_col]))
                    value = float(data_row[value_col])
                except (TypeError, ValueError, IndexError):
                    continue
                if key and value == value and abs(value) != float("inf"):
                    points.append([key, value])
            if points:
                return sorted({p[0]: p for p in points}.values())
    raise RuntimeError(f"EPU: no se encontró la columna {expected or 'Peru'}")


def main():
    series = {}
    for key, (url, column) in SOURCES.items():
        series[key] = parse(download(url), column)
    latam_url = SOURCES["LATAM"][0]
    series["PERU"] = parse(download(latam_url), "EPU_PER_local")
    payload = {
        "fuente": "Economic Policy Uncertainty, Baker, Bloom y Davis",
        "url": {key: url for key, (url, _) in SOURCES.items()},
        "licencia": "CC BY 4.0",
        "licencia_url": "https://creativecommons.org/licenses/by/4.0/",
        "atribucion": "Baker, Bloom y Davis, Economic Policy Uncertainty, https://www.policyuncertainty.com/",
        "actualizado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "series": series,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    for key, points in series.items():
        print(f"{key}: {len(points)} puntos {points[0][0]}–{points[-1][0]}")


if __name__ == "__main__":
    main()
