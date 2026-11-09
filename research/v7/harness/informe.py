"""Markdown report generator for harness results (V7 H1).

``informe.py`` reads per-model walk-forward result frames (or a saved JSON
dump from a baselines run) and writes a Markdown table comparing models by
horizon and year. Cells that significantly beat the random walk in MAE
(Diebold-Mariano p < 0.05) are bolded. If no model does so, nothing is
bolded, which is itself a valid result.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

NOMBRES = {
    "paseo aleatorio": "Paseo aleatorio",
    "deriva": "Deriva (EWMA)",
    "motor diario": "Motor diario (FHS)",
    "ETS": "ETS (damped trend)",
    "ARIMA": "ARIMA(1,1,0)",
}


def _fmt(x, decimales: int = 4) -> str:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return "—"
    return format(float(x), f".{decimales}f")


def _resumen_con_dm(res_df: pd.DataFrame) -> pd.DataFrame:
    from .walk_forward import resumen_por_modelo, diebold_mariano

    base = resumen_por_modelo(res_df)
    rw = res_df[res_df["modelo"] == "paseo aleatorio"]
    filas = []
    for _, fila in base.iterrows():
        modelo, h = fila["modelo"], int(fila["horizonte"])
        g = res_df[(res_df["modelo"] == modelo) & (res_df["horizonte"] == h)]
        rw_h = rw[rw["horizonte"] == h]
        # DM on errors aligned by cut date.
        comunes = sorted(set(g["corte"]) & set(rw_h["corte"]))
        gdm = g.set_index("corte").loc[comunes]
        rwdm = rw_h.set_index("corte").loc[comunes]
        e_m = gdm["p50"].to_numpy(dtype=float) - gdm["real"].to_numpy(dtype=float)
        e_r = rwdm["p50"].to_numpy(dtype=float) - rwdm["real"].to_numpy(dtype=float)
        dm, dm_p = diebold_mariano(e_m, e_r)
        mae_rw = float(np.mean(np.abs(e_r))) if len(e_r) else float("nan")
        mejora = (fila["mae"] < mae_rw) if len(e_r) else False
        filas.append(
            {
                "modelo": modelo,
                "label": NOMBRES.get(modelo, modelo),
                "horizonte": h,
                "mae": fila["mae"],
                "mae_rw": mae_rw,
                "mejora": mejora,
                "dm_p": dm_p,
                "dm": dm,
                "rmse": fila["rmse"],
                "mape": fila["mape"],
                "direccion": fila["direccion"],
                "direccion_p": fila["direccion_p"],
                "dentro_1pct": fila["dentro_1pct"],
                "cobertura_80": fila["cobertura_80"],
                "ancho": fila["ancho_medio_pct"],
                "n": int(fila["n"]),
            }
        )
    return pd.DataFrame(filas)


def _celda_mae(fila) -> str:
    mae = _fmt(fila["mae"])
    if fila["modelo"] == "paseo aleatorio":
        return f"{mae} (ref)"
    supera = bool(fila["mejora"]) and fila["dm_p"] is not None and not math.isnan(float(fila["dm_p"])) and float(fila["dm_p"]) < 0.05
    if supera:
        return f"**{mae}**"
    return mae


def generar_tabla_markdown(resumen: pd.DataFrame) -> str:
    resumen = resumen.sort_values(["horizonte", "mae"])
    lineas = [
        "## Comparación por horizonte (MAE en niveles; DM vs paseo aleatorio)",
        "",
        "Negrita = MAE significativamente menor que el paseo aleatorio (Diebold-Mariano p < 0,05). Sin negrita no hay significancia, aunque el MAE sea menor.",
        "",
        "| Modelo | h (días hábiles) | MAE | MAE paseo aleatorio | DM p | RMSE | MAPE % | Dir. % | Dir. p | ±1% | Cobertura 80% | Ancho medio % | n |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for _, f in resumen.iterrows():
        lineas.append(
            f"| {f['label']} | {int(f['horizonte'])} | {_celda_mae(f)} | {_fmt(f['mae_rw'])} | "
            f"{_fmt(f['dm_p'], 3)} | {_fmt(f['rmse'])} | {_fmt(f['mape'], 2)} | "
            f"{_fmt(f['direccion'] * 100, 1)} | {_fmt(f['direccion_p'], 3)} | {_fmt(f['dentro_1pct'], 1)} | "
            f"{_fmt(f['cobertura_80'], 1)} | {_fmt(f['ancho'], 2)} | {int(f['n'])} |"
        )
    lineas.append("")
    return "\n".join(lineas)


def _tabla_por_anio(res_df: pd.DataFrame, h: int) -> str:
    anios = sorted(set(res_df["corte"].str[:4]))
    modelos = [m for m in res_df["modelo"].unique()]
    cab = ["| Año | " + " | ".join(NOMBRES.get(m, m) for m in modelos) + " |"]
    sep = ["|---|" + "---|" * len(modelos)]
    filas = cab + sep
    for a in sorted(set(x for x in anios if x >= "2019" and x <= "2027")):
        celdas = [a]
        for m in modelos:
            g = res_df[(res_df["modelo"] == m) & (res_df["horizonte"] == h) & (res_df["corte"].str[:4] == a)]
            if len(g) == 0:
                celdas.append("—")
                continue
            e = g["p50"].to_numpy(dtype=float) - g["real"].to_numpy(dtype=float)
            celdas.append(_fmt(float(np.mean(np.abs(e)))))
        filas.append("| " + " | ".join(celdas) + " |")
    titulo = f"### MAE por año, horizonte h={h} días hábiles"
    return "\n".join([titulo, "", *filas, ""])


def escribir_informe(
    res_df: pd.DataFrame,
    destino: str | Path,
    *,
    titulo: str = "Banco de pruebas V7 — resultados walk-forward",
) -> Path:
    resumen = _resumen_con_dm(res_df)
    partes = [f"# {titulo}", "", generar_tabla_markdown(resumen)]
    for h in sorted(res_df["horizonte"].unique()):
        partes.append(_tabla_por_anio(res_df, int(h)))
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text("\n".join(partes), encoding="utf-8")
    return destino


def escribir_json(res_df: pd.DataFrame, destino: str | Path) -> Path:
    """Dump the long frame (and the per-H summary) to JSON for later use."""
    resumen = _resumen_con_dm(res_df)
    payload = {
        "columnas": list(res_df.columns),
        "filas": res_df.to_dict(orient="records"),
        "resumen": resumen.to_dict(orient="records"),
    }
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1, default=str)
    return destino


if __name__ == "__main__":  # pragma: no cover
    import argparse

    import pandas as pd

    p = argparse.ArgumentParser(description="Turn a harness results JSON into a Markdown report")
    p.add_argument("json_in", help="JSON written by escribir_json")
    p.add_argument("md_out", help="Destination Markdown report")
    args = p.parse_args()
    with open(args.json_in, encoding="utf-8") as fh:
        payload = json.load(fh)
    df = pd.DataFrame(payload["filas"])
    escribir_informe(df, args.md_out)
    print(f"reporte en {args.md_out}")
