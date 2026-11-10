# Banco de pruebas V7 — resultados walk-forward

## Comparación por horizonte (MAE en niveles; DM vs paseo aleatorio)

Negrita = MAE significativamente menor que el paseo aleatorio (Diebold-Mariano p < 0,05). Sin negrita no hay significancia, aunque el MAE sea menor.

| Modelo | h (días hábiles) | MAE | MAE paseo aleatorio | DM p | RMSE | MAPE % | Dir. % | Dir. p | ±1% | Cobertura 80% | Ancho medio % | n |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ARIMA(1,1,0) | 1 | 0.0155 | 0.0155 | 0.442 | 0.0221 | 0.42 | 51.3 | 0.280 | 91.4 | 56.8 | 0.73 | 1957 |
| Motor diario (FHS) | 1 | 0.0155 | 0.0155 | 1.000 | 0.0221 | 0.42 | — | — | 91.7 | 61.6 | 0.90 | 1957 |
| Paseo aleatorio | 1 | 0.0155 (ref) | 0.0155 | 1.000 | 0.0221 | 0.42 | — | — | 91.7 | 63.4 | 0.93 | 1957 |
| ETS (damped trend) | 1 | 0.0155 | 0.0155 | 0.675 | 0.0222 | 0.42 | 53.8 | 0.001 | 91.6 | 63.5 | 0.93 | 1957 |
| Deriva (EWMA) | 1 | 0.0156 | 0.0155 | 0.037 | 0.0224 | 0.43 | 52.4 | 0.041 | 91.5 | 63.1 | 0.93 | 1957 |
| Motor diario (FHS) | 5 | 0.0285 | 0.0285 | 1.000 | 0.0396 | 0.78 | — | — | 72.8 | 76.4 | 2.39 | 1953 |
| Paseo aleatorio | 5 | 0.0285 (ref) | 0.0285 | 1.000 | 0.0396 | 0.78 | — | — | 72.8 | 71.3 | 2.08 | 1953 |
| ARIMA(1,1,0) | 5 | 0.0285 | 0.0285 | 0.825 | 0.0397 | 0.78 | 46.5 | 0.188 | 72.6 | 71.4 | 1.95 | 1953 |
| ETS (damped trend) | 5 | 0.0288 | 0.0285 | 0.036 | 0.0400 | 0.78 | 51.2 | 0.686 | 72.3 | 70.8 | 2.08 | 1953 |
| Deriva (EWMA) | 5 | 0.0307 | 0.0285 | 0.000 | 0.0428 | 0.84 | 53.2 | 0.225 | 69.8 | 68.4 | 2.08 | 1953 |
| Motor diario (FHS) | 21 | 0.0553 | 0.0553 | 1.000 | 0.0711 | 1.50 | — | — | 41.6 | 75.9 | 4.96 | 1937 |
| Paseo aleatorio | 21 | 0.0553 (ref) | 0.0553 | 1.000 | 0.0711 | 1.50 | — | — | 41.6 | 70.6 | 4.28 | 1937 |
| ARIMA(1,1,0) | 21 | 0.0553 | 0.0553 | 0.330 | 0.0712 | 1.50 | 48.4 | 0.834 | 42.2 | 73.9 | 4.17 | 1937 |
| ETS (damped trend) | 21 | 0.0554 | 0.0553 | 0.018 | 0.0720 | 1.51 | 58.2 | 0.142 | 43.1 | 70.4 | 4.29 | 1937 |
| Deriva (EWMA) | 21 | 0.0728 | 0.0553 | 0.000 | 0.0950 | 1.98 | 50.5 | 1.000 | 32.2 | 60.8 | 4.29 | 1937 |

### MAE por año, horizonte h=1 días hábiles

| Año | Paseo aleatorio | Deriva (EWMA) | Motor diario (FHS) | ETS (damped trend) | ARIMA(1,1,0) |
|---|---|---|---|---|---|
| 2019 | 0.0098 | 0.0100 | 0.0098 | 0.0098 | 0.0097 |
| 2020 | 0.0159 | 0.0160 | 0.0159 | 0.0160 | 0.0159 |
| 2021 | 0.0213 | 0.0216 | 0.0213 | 0.0212 | 0.0211 |
| 2022 | 0.0215 | 0.0216 | 0.0215 | 0.0215 | 0.0215 |
| 2023 | 0.0139 | 0.0139 | 0.0139 | 0.0138 | 0.0138 |
| 2024 | 0.0155 | 0.0157 | 0.0155 | 0.0156 | 0.0155 |
| 2025 | 0.0123 | 0.0123 | 0.0123 | 0.0123 | 0.0123 |
| 2026 | 0.0135 | 0.0137 | 0.0135 | 0.0135 | 0.0137 |

### MAE por año, horizonte h=5 días hábiles

| Año | Paseo aleatorio | Deriva (EWMA) | Motor diario (FHS) | ETS (damped trend) | ARIMA(1,1,0) |
|---|---|---|---|---|---|
| 2019 | 0.0180 | 0.0199 | 0.0180 | 0.0182 | 0.0180 |
| 2020 | 0.0268 | 0.0282 | 0.0268 | 0.0269 | 0.0272 |
| 2021 | 0.0408 | 0.0448 | 0.0408 | 0.0402 | 0.0406 |
| 2022 | 0.0388 | 0.0422 | 0.0388 | 0.0394 | 0.0387 |
| 2023 | 0.0286 | 0.0297 | 0.0286 | 0.0287 | 0.0284 |
| 2024 | 0.0280 | 0.0306 | 0.0280 | 0.0284 | 0.0280 |
| 2025 | 0.0215 | 0.0226 | 0.0215 | 0.0218 | 0.0215 |
| 2026 | 0.0248 | 0.0267 | 0.0248 | 0.0255 | 0.0251 |

### MAE por año, horizonte h=21 días hábiles

| Año | Paseo aleatorio | Deriva (EWMA) | Motor diario (FHS) | ETS (damped trend) | ARIMA(1,1,0) |
|---|---|---|---|---|---|
| 2019 | 0.0361 | 0.0534 | 0.0361 | 0.0374 | 0.0363 |
| 2020 | 0.0501 | 0.0690 | 0.0501 | 0.0494 | 0.0504 |
| 2021 | 0.0810 | 0.1027 | 0.0810 | 0.0782 | 0.0808 |
| 2022 | 0.0771 | 0.1019 | 0.0771 | 0.0782 | 0.0770 |
| 2023 | 0.0593 | 0.0715 | 0.0593 | 0.0588 | 0.0591 |
| 2024 | 0.0499 | 0.0759 | 0.0499 | 0.0520 | 0.0500 |
| 2025 | 0.0437 | 0.0454 | 0.0437 | 0.0429 | 0.0435 |
| 2026 | 0.0413 | 0.0586 | 0.0413 | 0.0428 | 0.0417 |

## Lectura honesta

El dólar diario es casi un paseo aleatorio: el ruido idiosincrásico de cada día domina sobre cualquier señal predecible a 1 día, y a 21 días la varianza acumulada del ruido crece como √h mientras que la deriva estimada sigue siendo una fracción pequeña del precio. Por eso batir al paseo aleatorio en MAE exige p < 0,05 en Diebold-Mariano y, como se verá en la tabla, ninguna referencia clásica lo consigue de forma sostenida: la deriva EWMA pierde a h=5 y h=21 (con significancia en sentido contrario, el DM la rechaza), y ETS/ARIMA equivalen a una deriva suavizada con más parámetros y la misma varianza. Lo que cambia entre modelos no es el punto (p50 sigue siendo el último cierre) sino el ancho de la banda: el FHS expansivo del motor diario cubre 62-76% (por debajo del 80% nominal a h=1, porque K solo usa puños ya realizados cuando llega un shock) y las gaussianas de ETS/ARIMA cubren 57-74%, también estrechas en tramos de alta volatilidad, como muestra la cobertura.

Datos usados: USD/PEN diario del BCRP (SBS venta; respaldo `data/official/bcrp-daily.json`, series.PEN.serie, mientras no exista `~/v7/data/bcrp/PD04640PD.csv`). Cortes diarios 2019-01-02 hasta la última fecha con horizonte completo. Horizontes 1, 5 y 21 días hábiles. Entrenamiento = pasado exclusivamente (fecha_disponible de cada fila ≤ corte). Dirección sobre cortes no solapados (cada h días) con p-valor binomial frente al 50%, cambios nulos excluidos; paseo aleatorio y motor diario no pronostican dirección (p50 = último cierre) y reportan `—`. DM con corrección HLN y varianza HAC de un retardo; la muestra no solapada elimina la autocorrelación por solape por construcción.

En concreto: el mejor MAE fuera del paseo aleatorio es ARIMA(1,1,0) a h=1 (0.0155 frente a 0.0155 del paseo aleatorio), con DM p=0.442. No es < 0,05: la ventaja no es significativa. A mayor horizonte la brecha se cierra porque la deriva estimada es ruido sobre √h.

Nota FHS: `scripts/engine-daily.js` calibra K en muestra completa (producción). Aquí K es expansivo (solo needs realizados antes del corte), la versión honesta; documentada en `walk_forward.py`.
