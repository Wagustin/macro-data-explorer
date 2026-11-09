"""Data loading with strict no-lookahead filtering (V7 conventions).

The harness never sees the future: every row carries two dates, ``fecha``
(when the value occurred) and ``fecha_disponible`` (when it became known in
practice). ``cargar_serie`` only returns rows with ``fecha_disponible <= como_de``.

Data resolution order:
  1. ``~/v7/data/{bcrp,externos}/<id>.csv`` (V7 program data, outside git), where
     the CSV has header ``fecha,valor,fecha_disponible``. If the last column is
     missing it is derived per V7 conventions: daily series are published the
     next business day, monthly series 45 days after the end of the month.
  2. Fallback for the dollar: ``data/official/bcrp-daily.json`` in this
     repository (``series.PEN.serie``), used while
     ``~/v7/data/bcrp/PD04640PD.csv`` does not exist yet. Its
     ``fecha_disponible`` is derived as the next weekday.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

V7_DATA = Path.home() / "v7" / "data"
REPO_ROOT = Path(__file__).resolve().parents[3]
BCRP_DAILY_JSON = REPO_ROOT / "data" / "official" / "bcrp-daily.json"
DOLARES_IDS = {"PEN", "PD04640PD", "USDPEN", "USD_PEN"}
SUBDIRS = ("bcrp", "externos")


def _siguiente_dia_habil(fechas: pd.Series) -> pd.Series:
    """Next weekday (Mon-Fri) strictly after each ISO date, as ISO strings."""
    fechas = pd.to_datetime(fechas, format="%Y-%m-%d")
    return (fechas + pd.offsets.BDay(1)).dt.strftime("%Y-%m-%d")


def _inferir_fecha_disponible(fechas: pd.Series) -> pd.Series:
    """V7 conventions: daily series are published the next business day;
    monthly series 45 days after the end of each month."""
    fechas_dt = pd.to_datetime(fechas, format="%Y-%m-%d")
    if len(fechas_dt) >= 4:
        huecos = fechas_dt.diff().dt.days.dropna()
        mediana = float(huecos.median()) if len(huecos) else 1.0
        if mediana > 20:
            return (fechas_dt + pd.Timedelta(days=45)).dt.strftime("%Y-%m-%d")
    return _siguiente_dia_habil(fechas)


def _normalizar(df: pd.DataFrame) -> pd.DataFrame:
    df = df[["fecha", "valor", "fecha_disponible"]].copy()
    df["valor"] = pd.to_numeric(df["valor"], errors="raise")
    df = df.dropna(subset=["valor"]).drop_duplicates(subset="fecha", keep="last")
    return df.sort_values("fecha").reset_index(drop=True)


def _df_desde_csv(ruta: Path) -> pd.DataFrame:
    df = pd.read_csv(ruta)
    df.columns = [str(c).strip().lower() for c in df.columns]
    if "fecha" not in df.columns or "valor" not in df.columns:
        raise ValueError(
            f"{ruta.name}: expected columns fecha,valor[,fecha_disponible], got {list(df.columns)}"
        )
    if "fecha_disponible" not in df.columns:
        df["fecha_disponible"] = _inferir_fecha_disponible(df["fecha"])
    return _normalizar(df)


def _df_desde_respaldo(serie: str = "PEN", ruta: Path | None = None) -> pd.DataFrame:
    ruta = ruta or BCRP_DAILY_JSON
    with open(ruta, encoding="utf-8") as fh:
        datos = json.load(fh)
    try:
        filas = datos["series"][serie]["serie"]
    except (KeyError, TypeError) as exc:
        raise FileNotFoundError(
            f"Fallback {ruta} has no series {serie!r} (available: "
            f"{sorted(datos.get('series', {}))})"
        ) from exc
    df = pd.DataFrame(filas, columns=["fecha", "valor"])
    df["fecha_disponible"] = _siguiente_dia_habil(df["fecha"])
    return _normalizar(df)


def _validar_fecha(fecha: str) -> str:
    fecha = str(fecha)
    try:
        dt = pd.to_datetime(fecha, format="%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"como_de debe ser una fecha ISO AAAA-MM-DD, got {fecha!r}") from exc
    if dt.strftime("%Y-%m-%d") != fecha:
        raise ValueError(f"como_de debe ser una fecha ISO AAAA-MM-DD, got {fecha!r}")
    return fecha


def cargar_serie(id: str, como_de: str | None = None) -> pd.DataFrame:
    """Load a series with no-lookahead filtering.

    Parameters:
        id: series identifier. Matches a CSV stem under ``~/v7/data/bcrp/``
            or ``~/v7/data/externos/`` (e.g. ``PD04640PD``), or a dollar alias
            (``PEN`` / ``PD04640PD``) that falls back to the repository's
            ``data/official/bcrp-daily.json`` while the V7 CSV does not exist.
        como_de: optional ISO cutoff. Only rows with
            ``fecha_disponible <= como_de`` are returned.

    Returns DataFrame with columns ``fecha, valor, fecha_disponible`` sorted
    by fecha (ISO strings, UTC).
    """
    id_norm = str(id).strip()
    stem = id_norm[:-4] if id_norm.lower().endswith(".csv") else id_norm

    df = None
    for sub in SUBDIRS:
        carpeta = V7_DATA / sub
        if not carpeta.is_dir():
            continue
        for csv in sorted(carpeta.glob("*.csv")):
            if csv.stem.lower() == stem.lower():
                df = _df_desde_csv(csv)
                break
        if df is not None:
            break

    if df is None and id_norm.upper() in DOLARES_IDS:
        df = _df_desde_respaldo("PEN")

    if df is None:
        hallados = []
        for sub in SUBDIRS:
            carpeta = V7_DATA / sub
            if carpeta.is_dir():
                hallados += [p.name for p in sorted(carpeta.glob("*.csv"))]
        raise FileNotFoundError(
            f"No series found for id={id!r}. CSVs under ~/v7/data: {hallados or 'none'}"
        )

    if como_de is not None:
        como_de = _validar_fecha(como_de)
        df = df[df["fecha_disponible"] <= como_de].reset_index(drop=True)
    return df


if __name__ == "__main__":  # pragma: no cover - manual smoke check
    import argparse

    p = argparse.ArgumentParser(description="Load a V7 series with no-lookahead filtering")
    p.add_argument("id", help="Series id (e.g. PEN, PD04640PD)")
    p.add_argument("--como-de", default=None, help="ISO cutoff (optional)")
    args = p.parse_args()
    serie = cargar_serie(args.id, args.como_de)
    print(f"serie {args.id!r}: {len(serie)} rows, {serie.fecha.min()} .. {serie.fecha.max()}")
    print(serie.head(3).to_string(index=False))
    print(serie.tail(3).to_string(index=False))
