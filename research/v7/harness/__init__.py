"""V7 H1: banco de pruebas con validación hacia adelante (módulo harness).

Aplica las convenciones de ``~/kathy_workspace/handoff/v7/CONVENCIONES.md``:
solo pasa a producción lo que supere a las referencias en años no vistos.
"""
from .datos import cargar_serie
from .informe import (
    _resumen_con_dm,
    escribir_informe,
    escribir_json,
    generar_tabla_markdown,
)
from .walk_forward import (
    diebold_mariano,
    direccion_acierto,
    metricas,
    modelo_arima,
    modelo_deriva,
    modelo_ets,
    modelo_motor_diario,
    modelo_paseo_aleatorio,
    resumen_por_modelo,
    walk_forward,
)

__all__ = [
    "cargar_serie",
    "walk_forward",
    "metricas",
    "resumen_por_modelo",
    "diebold_mariano",
    "direccion_acierto",
    "modelo_paseo_aleatorio",
    "modelo_deriva",
    "modelo_motor_diario",
    "modelo_ets",
    "modelo_arima",
    "escribir_informe",
    "escribir_json",
    "generar_tabla_markdown",
    "_resumen_con_dm",
]
