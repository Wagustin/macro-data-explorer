# Harness V7 — banco de pruebas con validación hacia adelante

La vara de medir de todos los modelos del programa V7 (USD/PEN primero, después otros activos). Entrena con el pasado y evalúa en un periodo que el modelo no vio, desde **2019-01-02**. Resultados negativos son resultados válidos.

## Qué incluye

- **`datos.py`** — `cargar_serie(id, como_de=None)`: lee `~/v7/data/bcrp|externos/<id>.csv` (CSV `fecha,valor,fecha_disponible`, fuera de git) y devuelve solo filas con `fecha_disponible <= como_de`. Sin CSV, el dólar usa de respaldo `data/official/bcrp-daily.json` (`series.PEN.serie`) mientras no exista `~/v7/data/bcrp/PD04640PD.csv`. En el servidor existe `~/v7/data/bcrp/tipo_cambio.csv` con los mismos precios desde 2000 (idéntico al JSON desde 2012) pero bajo otro nombre, así que el respaldo sigue siendo el JSON hasta que aparezca `PD04640PD.csv`. La `fecha_disponible` se deriva por convención V7 (diarias: siguiente día hábil; mensuales: +45 días) cuando el CSV no la trae.
- **`walk_forward.py`** — `walk_forward(modelo, serie, inicio, horizontes, reentrenar_cada)` con cortes diarios desde `inicio`, horizontes en días hábiles (1, 5, 21) y modelo `f(historia, h, covariables_hasta_corte) -> {p10,p25,p50,p75,p90}`. Las referencias incluidas son: paseo aleatorio, deriva EWMA, la réplica en Python del motor diario actual (`scripts/engine-daily.js`: FHS con volatilidad EWMA, P50 = paseo aleatorio, factor K expansivo), ETS (`ExponentialSmoothing` con bandas EWMA) y ARIMA(1,1,0) de statsmodels (un ajuste por corte, memoizado para los tres horizontes; números idénticos a reajustar por h).
  - **Dirección**: acierto sobre cortes **no solapados** (cada h días) con p-valor binomial frente al 50%, cambios nulos excluidos. El solape induciría autocorrelación en los errores de horizontes largos: la submuestra no solapada la elimina por construcción, sin necesidad de corrección HAC. Paseo aleatorio y motor diario no tienen señal direccional (p50 idéntico al cierre) y reportan `—`, no 0%.
  - **DM**: Diebold-Mariano con corrección HLN y varianza HAC de un retardo.
  - **FHS honesto**: el JS calibra K en muestra completa; aquí K es expansivo (solo `need` realizados antes del corte), documentado en `walk_forward.py`.
  - **Ancho medio**: en % del precio del corte (pT), como el `ancho_banda_pct` del JS, no del valor realizado.
- **`metricas()`** (en `walk_forward.py`) — MAE, RMSE (absolutos y relativos al paseo aleatorio), MAPE, acierto de dirección + p binomial, porcentaje dentro de ±1% y ±0,5%, pérdida de pinball por cuantil, cobertura de bandas 80% y 50%, ancho medio y DM contra el paseo aleatorio, por horizonte y por año.
- **`informe.py`** — `escribir_informe(res_df, destino)` y `escribir_json(res_df, destino)`: tabla Markdown comparando modelos por horizonte y año; **negrita** lo que supera al paseo aleatorio con p < 0,05.
- **`baselines.py`** — corrida completa sobre el dólar 2019-2026; escribe `research/v7/resultados/harness-reporte.md`, `research/v7/resultados/harness-resultados.json` y `~/kathy_workspace/handoff/v7/baselines.md` con la tabla y la lectura honesta.
- **`test_harness.py`** — pruebas con series sintéticas (deriva conocida, paseo aleatorio puro) que comprueban que las métricas y el DM funcionan y que `walk_forward` nunca usa datos con `fecha_disponible` posterior al corte.

## Ejecución

Entorno: `~/v7-env/bin/python` (cuando existe `~/v7/ENV_OK`).

```bash
# Carga (con o sin corte)
~/v7-env/bin/python -m research.v7.harness.datos PEN --como-de 2024-01-01

# Pruebas (sin pytest instalado en el venv: unittest estándar)
~/v7-env/bin/python -m unittest research.v7.harness.test_harness -v

# Baselines completas (referencias clásicas; decenas de minutos con ETS/ARIMA
# memoizados; lanzar desacoplado con nice según CONVENCIONES.md o en Actions)
~/v7-env/bin/python -m research.v7.harness.baselines

# …o en GitHub Actions (workflow_dispatch) con el resultado en research/v7/resultados/
# (.github/workflows/v7-harness.yml: tests + baselines, artifact harness-resultados)
```

## Formato de salida de datos

`cargar_serie`: DataFrame `fecha, valor, fecha_disponible` (fechas ISO `AAAA-MM-DD` UTC, ordenado por fecha).
`walk_forward`: DataFrame largo `modelo, corte, fecha_objetivo, horizonte, p10, p25, p50, p75, p90, real, pT` (una fila por corte×horizonte).
`harness-resultados.json`: `{columnas, filas, resumen}` (filas = frame largo; resumen = una fila por modelo×horizonte con DM contra el paseo aleatorio).

## Notas de cómputo

El servidor de Agustín es solo para trabajo ligero: este paquete corre en modo "referencias clásicas" (ETS/ARIMA con un ajuste memoizado por corte y cadencia de reconstrucción cada 21 días). Para modelos pesados (TimesFM/Chronos/LightGBM) la corrida debe hacerse con `workflow_dispatch` en GitHub Actions (`.github/workflows/v7-harness.yml`, trabajos ≤40 min según `CONVENCIONES.md`), escribiendo en `research/v7/resultados/`. El horizonte final de prueba (2025 en adelante) no lo ve ningún bucle de optimización.

## Evidencia de la auditoría (fix previo)

El `harness-resultados.json` y el reporte comprometidos en este repo provienen de una corrida anterior al fix de `_escalar_sigma` (ver docstring en `walk_forward.py`): las bandas del paseo aleatorio y del motor diario aparecen infladas ~1500x (ancho medio 10^8 %) mientras ETS/ARIMA sí son razonables, y paseo/motor son fila a fila idénticos (el motor caía al fallback). Re-ejecutar `baselines.py` con el código actual regenera `research/v7/resultados/harness-reporte.md`, `research/v7/resultados/harness-resultados.json` y `~/kathy_workspace/handoff/v7/baselines.md` con bandas y cobertura sanas.
