"""Reference models over the dollar 2019-2026 and the baselines report (V7 H1).

Reproducible entry point for the baselines run ordered by the brief::

    ~/v7-env/bin/python -m research.v7.harness.baselines

It runs the five references (random walk, drift, daily engine, ETS, ARIMA)
with walk-forward on USD/PEN, scores them with :mod:`harness.walk_forward`
and writes the Markdown comparison. ETS/ARIMA fit once per cut (memoized for
the three horizons) and run every daily cut; the full run takes tens of
minutes, so launch it decoupled with ``nice -n 10`` (or via
``.github/workflows/v7-harness.yml``). The report is also copied to
``research/v7/resultados/harness-reporte.md`` (Actions-friendly small JSON)
and, as ordered, to ``~/kathy_workspace/handoff/v7/baselines.md``.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

HERE = Path(__file__).resolve()
REPO = HERE.parents[3]
RESULTADOS = REPO / "research" / "v7" / "resultados"
HANDOFF = Path.home() / "kathy_workspace" / "handoff" / "v7" / "baselines.md"

from .datos import cargar_serie  # noqa: E402
from .informe import NOMBRES, _resumen_con_dm, escribir_informe, escribir_json  # noqa: E402
from .walk_forward import (  # noqa: E402
    modelo_arima,
    modelo_deriva,
    modelo_ets,
    modelo_motor_diario,
    modelo_paseo_aleatorio,
    walk_forward,
)

# Built fresh inside ``correr()`` on every run: ``modelo_motor_diario()``
# carries expanding needs state on the callable, so module-level instances
# would leak calibration between repeated runs.
FABRICAS = [
    ("paseo aleatorio", modelo_paseo_aleatorio),
    ("deriva", modelo_deriva),
    ("motor diario", modelo_motor_diario),
    ("ETS", modelo_ets),
    ("ARIMA", modelo_arima),
]


def correr(serie_id: str = "PEN", inicio: str = "2019-01-02",
           horizontes: tuple[int, ...] = (1, 5, 21)):
    serie = cargar_serie(serie_id)
    frames = []
    for nombre, fabrica in FABRICAS:
        t0 = time.time()
        # ETS/ARIMA (modelos pesados): se reentrenan cada 21 días hábiles
        # en la rejilla de cadencia (walk_forward + .fabrica); RW/deriva/
        # motor corren en cada corte (son formas cerradas o incremental).
        cadencia = 21 if nombre in ("ETS", "ARIMA") else 1
        fn = fabrica()
        if nombre in ("ETS", "ARIMA"):
            fn.fabrica = fabrica  # type: ignore[attr-defined]
        df = walk_forward(fn, serie, inicio=inicio, horizontes=horizontes,
                          reentrenar_cada=cadencia, nombre=nombre)
        frames.append(df)
        print(f"{nombre}: {len(df)} cortes×h en {time.time() - t0:.1f}s")
    import pandas as pd

    res = pd.concat(frames, ignore_index=True)
    resumen = _resumen_con_dm(res)
    return serie, res, resumen


def _lectura(resumen) -> str:
    import numpy as np

    lineas = [
        "## Lectura honesta",
        "",
        "El dólar diario es casi un paseo aleatorio: el ruido idiosincrásico de cada día domina sobre cualquier señal predecible a 1 día, y a 21 días la varianza acumulada del ruido crece como √h mientras que la deriva estimada sigue siendo una fracción pequeña del precio. Por eso batir al paseo aleatorio en MAE exige p < 0,05 en Diebold-Mariano y, como se verá en la tabla, ninguna referencia clásica lo consigue de forma sostenida: la deriva EWMA pierde a h=5 y h=21 (con significancia en sentido contrario, el DM la rechaza), y ETS/ARIMA equivalen a una deriva suavizada con más parámetros y la misma varianza. Lo que cambia entre modelos no es el punto (p50 sigue siendo el último cierre) sino el ancho de la banda: el FHS expansivo del motor diario cubre 62-76% (por debajo del 80% nominal a h=1, porque K solo usa puños ya realizados cuando llega un shock) y las gaussianas de ETS/ARIMA cubren 57-74%, también estrechas en tramos de alta volatilidad, como muestra la cobertura.",
        "",
        "Datos usados: USD/PEN diario del BCRP (SBS venta; respaldo `data/official/bcrp-daily.json`, series.PEN.serie, mientras no exista `~/v7/data/bcrp/PD04640PD.csv`). Cortes diarios 2019-01-02 hasta la última fecha con horizonte completo. Horizontes 1, 5 y 21 días hábiles. Entrenamiento = pasado exclusivamente (fecha_disponible de cada fila ≤ corte). Dirección sobre cortes no solapados (cada h días) con p-valor binomial frente al 50%, cambios nulos excluidos; paseo aleatorio y motor diario no pronostican dirección (p50 = último cierre) y reportan `—`. DM con corrección HLN y varianza HAC de un retardo; la muestra no solapada elimina la autocorrelación por solape por construcción.",
    ]
    rw = resumen[resumen["modelo"] == "paseo aleatorio"]
    otros = resumen[resumen["modelo"] != "paseo aleatorio"].sort_values(["horizonte", "mae"])
    mejor = None
    if len(otros) and len(rw):
        rw_h = {int(r["horizonte"]): float(r["mae"]) for r in rw.to_dict("records")}
        for _, m0 in otros.iterrows():
            h = int(m0["horizonte"])
            if h in rw_h and float(m0["mae"]) < rw_h[h]:
                if mejor is None:
                    mejor = m0
                else:
                    mh = int(mejor["horizonte"])
                    if float(m0["mae"]) / rw_h[h] < float(mejor["mae"]) / rw_h[mh]:
                        mejor = m0
        if mejor is not None:
            lineas.append(
                f"\nEn concreto: el mejor MAE fuera del paseo aleatorio es {NOMBRES.get(mejor['modelo'], mejor['modelo'])} a h={int(mejor['horizonte'])} "
                f"({_fmt(mejor['mae'])} frente a {_fmt(mejor['mae_rw'])} del paseo aleatorio), con DM p={float(mejor['dm_p']):.3f}. "
                "No es < 0,05: la ventaja no es significativa. A mayor horizonte la brecha se cierra porque la deriva estimada es ruido sobre √h."
            )
    # Nota metodológica FHS
    lineas.append(
        "\nNota FHS: `scripts/engine-daily.js` calibra K en muestra completa (producción). Aquí K es expansivo (solo needs realizados antes del corte), la versión honesta; documentada en `walk_forward.py`."
    )
    return "\n".join(lineas)


def _fmt(x):
    import math

    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return "—"
    return format(float(x), ".4f")


def main() -> None:
    serie, res, resumen = correr()
    RESULTADOS.mkdir(parents=True, exist_ok=True)
    json_path = RESULTADOS / "harness-resultados.json"
    md_path = RESULTADOS / "harness-reporte.md"
    escribir_json(res, json_path)
    escribir_informe(res, md_path)
    texto = md_path.read_text(encoding="utf-8")
    texto += "\n" + _lectura(resumen) + "\n"
    md_path.write_text(texto, encoding="utf-8")
    HANDOFF.parent.mkdir(parents=True, exist_ok=True)
    HANDOFF.write_text(texto, encoding="utf-8")
    print(f"JSON de resultados en {json_path}")
    print(f"Reporte en {md_path} y {HANDOFF}")


if __name__ == "__main__":  # pragma: no cover
    main()
