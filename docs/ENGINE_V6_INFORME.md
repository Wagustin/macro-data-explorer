# PerData Engine v6 híbrido: informe de calibración

T54 evaluó 61 activos con cortes rodantes y seleccionó los pesos en una mitad de los activos, puntuándolos en la otra, y luego invirtió las mitades. P50 MAPE es mejor cuanto menor. La decisión de T54b adopta la mezcla T54 hasta 24 meses y conserva exactamente los pesos y factores K80 del motor v5 a 36 y 48 meses. Entre 24 y 36 meses se interpolan linealmente las distribuciones de ambos métodos.

| Meses | Fuente | a Chronos-2 | b v3 | c TimesFM | MAPE v5 | MAPE v6 híbrido | MAPE sin cambio | K80 | Cobertura fuera de muestra |
|---:|:---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | v6 | 0.05 | 0.10 | 0.00 | 5.50 | 5.41 | 5.37 | 0.94 | 79.1% |
| 3 | v6 | 0.00 | 0.00 | 0.10 | 11.40 | 10.92 | 10.77 | 1.17 | 81.7% |
| 6 | v6 | 0.00 | 0.00 | 0.25 | 17.10 | 15.73 | 15.81 | 1.21 | 79.6% |
| 12 | v6 | 0.10 | 0.05 | 0.40 | 21.75 | 20.81 | 20.92 | 1.40 | 79.7% |
| 24 | v6 | 0.10 | 0.00 | 0.60 | 28.88 | 28.22 | 28.30 | 1.41 | 80.4% |
| 36 | v5 | 0.9333 | 0.0667 | 0.00 | 31.45 | 31.45 | 31.56 | 1.50 | 79.2% |
| 48 | v5 | 0.95 | 0.05 | 0.00 | 34.55 | 34.55 | 32.86 | 1.72 | 78.8% |

La regla de adopción se cumple: el híbrido no supera el MAPE de v5 en ninguno de los siete plazos, mejora la referencia sin cambio en cuatro (6, 12, 24 y 36 meses), y la cobertura P10–P90 queda entre 78% y 82% en los siete. Por ello `adoptar` es `true` y `fuente` identifica la calibración usada en cada plazo.

La predicción central mezcla Chronos-2, TimesFM, v3 y el último cierre con los pesos indicados; si falta la ruta TimesFM de un símbolo en el lote diario, `c` pasa a cero y su peso queda en la parte asignada al último cierre. La banda se calcula con la dispersión relativa de Chronos-2 y TimesFM, ponderada por sus pesos, centrada en el nuevo P50 y ajustada con K80. Para plazos mayores de 24 meses se conserva la mezcla v5. El lote diario registra el estado de TimesFM en `data/engine-report.json`.

## Prueba por clase de activo (30-oct-2026): no se adopta

`scripts/calibrate-classes.js` repite la calibración de la mezcla (Chronos-2, TimesFM, último cierre) por clase de activo, con validación cruzada entre dos mitades de activos, y la compara con la mezcla global de v6 sobre las mismas filas. No escribe `engine-params.json`.

| Clase (activos) | 1 m | 3 m | 6 m | 12 m | 24 m |
|---|---|---|---|---|---|
| Acciones de Lima (27) | +0.1 | +0.0 | −0.0 | −0.1 | +0.4 |
| Divisas (10) | 0.0 | +0.1 | −0.0 | +0.0 | +0.2 |
| Materias primas (13) | +0.3 | **−0.9** | **−0.8** | **−0.5** | **−0.9** |
| Series oficiales (7) | +0.2 | +0.4 | +1.1 | +0.7 | +0.6 |
| Tasas e índices (sin datos suficientes) | | | | | |

(MAPE de la clase calibrada menos MAPE de la mezcla global; negativo = mejora.)

Solo las materias primas mejoran, entre 0.5 y 0.9 puntos de MAPE a 3-24 meses, con 13 activos muy correlacionados entre sí (la evidencia independiente es mucho menor) y peor a 1 mes. Las demás clases empeoran por sobreajuste con pocos activos. La mezcla global ya deja a las acciones de Lima en el nivel de «sin cambio». Decisión: sin pesos por clase; se revisa cuando haya más activos por clase o historia propia en `forecast_history`.
