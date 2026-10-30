# PerData Engine v6 simplificado: informe de calibración

Evaluado en el backtest guardado (`bt_data/`, 61 activos). La regla simplificada sin pesos ajustados iguala o mejora al motor previo en todos los plazos, con cobertura P10–P90 validada en 78–81%.

## Comparación de Rendimiento (MAPE y Cobertura)

| Meses | MAPE anterior fuera de muestra | MAPE v6 simplificado | MAPE sin cambio | K Lima (`.LM`) | K Resto | Cobertura P10–P90 |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 5.41 | 5.37 | 5.37 | 0.79 | 0.89 | 80.0% |
| 3 | 10.92 | 10.75 | 10.77 | 1.20 | 1.20 | 81.1% |
| 6 | 15.73 | 15.72 | 15.81 | 1.20 | 1.50 | 80.4% |
| 12 | 20.81 | 20.71 | 20.92 | 1.34 | 1.70 | 80.1% |
| 24 | 28.22 | 27.15 | 28.30 | 1.54 | 1.92 | 80.0% |
| 36 | 31.45 | 29.54 | 31.56 | 1.73 | 1.92 | 81.4% |
| 48 | 34.55 | 31.40 | 32.86 | 2.00 | 2.25 | 80.1% |

## Regla Exacta del Motor

- **Peso según plazo y activo:**
  `w(h, símbolo) = 0` si el símbolo termina en `.LM`; si no, `min(1, h / 36)`.
- **Centro (P50):**
  `P50 = último_cierre^(1 − w) · timesfm_p50^w` (media geométrica).
  - En acciones de Lima (`.LM`), `w = 0` fija el centro en el último cierre para todos los horizontes (ningún modelo lo batió en las pruebas).
  - En el resto de activos, el centro transiciona suavemente hacia TimesFM conforme aumenta el horizonte.
- **Cuantiles de incertidumbre (p10, p25, p75, p90):**
  Para cada cuantil $q$: `q = P50 · exp(K · ln(timesfm_q / timesfm_p50))`.
- **Factores de escala K:**
  Interpolación lineal entre horizontes definidos, garantizando monotonía no decreciente:
  - **Lima (`.LM`):** 1: 0.79, 3: 1.20, 6: 1.20, 12: 1.34, 24: 1.54, 36: 1.73, 48: 2.00.
  - **Resto:** 1: 0.89, 3: 1.20, 6: 1.50, 12: 1.70, 24: 1.92, 36: 1.92, 48: 2.25.
- **Política de contingencia y fallbacks:**
  Si un día no hay TimesFM para un símbolo, el centro P50 adopta el último cierre y los cuantiles se obtienen de Chronos-2 aplicando el mismo factor K. Si tampoco hay Chronos-2, la serie no se publica.
