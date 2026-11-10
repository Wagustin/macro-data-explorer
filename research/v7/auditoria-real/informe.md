# Auditoría real del motor — diario (walk-forward) y mensual

**Fecha:** 2026-11-09 · **Datos:** `data/official/bcrp-daily.json` (PEN, 2012-01-02→2026-11-06) · **Motor diario:** `scripts/engine-daily.js` · **Motor mensual:** `api/forecast.js` (`buildForecast`) · **Calibración mensual:** `api/_lib/calibration.json`

## 1. Motor diario — EN MUESTRA (cifra circular: no prueba nada)

`auditar-diario.mjs` calibra K=1.0182 con los 1958 cortes de 2019-2026 y luego mide la cobertura sobre **esos mismos cortes**: **80,03 %** por construcción. La fila «OOS» del informe anterior repetía esa misma cifra porque `testStartDate = startDate = 2019-01-01` deja **0 cortes de entrenamiento** (`K_train = K_full`). Queda como diagnóstico (K≈1: la calibración apenas mueve los cuantiles), no como evidencia.

## 2. Motor diario — FUERA DE MUESTRA (K con la historia de cada día)

Se replica la llamada que usa el boletín (`scripts/boletin.js` → `data/daily-forecasts.json` → `generateDailyForecasts`): `K = runFHSBacktest(serie hasta el corte, 1).K`, `q10/q90 = computeCurrentFHSQuantiles(...)`, `p10/p90 = cierre × exp(K·q)`. K se recalcula cada 5 días hábiles (a diario durante los primeros 60 cortes) usando **solo datos hasta ese día**. 1958 cortes, 2019-01-02 → 2026-11-05.

| Métrica | FHS+EWMA (K walk-forward) | Paseo aleatorio (q10-q90 de 250 retornos) |
|---------|------------------------------|----------------------------------------------|
| Cobertura 80% (global) | **80,59 %** | 78,60 % |
| Cobertura 80% (estable, ≥60 cortes de calibración) | 80,61 % | 78,50 % |
| Ancho medio | 0,897 % / 0,0329 soles | 0,830 % / 0,0305 soles |
| Winkler | 0,1004 | 0,0985 |

- Winkler = raíz de la puntuación de intervalo α-normalizada (Gneiting & Raftery 2007) en espacio logarítmico; la forma gaussiana clásica no está definida a esta escala (σ implícito ≪ 1). Menor = mejor.
- **Por año** (cobertura 80%): FHS → 2019 79,12 % · 2020 82,68 % · 2021 82,87 % · 2022 78,09 % · 2023 80,00 % · 2024 78,46 % · 2025 80,65 % · 2026 83,25 %. Paseo aleatorio → 75,10 · 74,02 · 78,09 · 78,88 · 84,40 · 78,46 · 81,85 · 77,99 %.
- **Por tercil de volatilidad de 20 días** (FHS / paseo aleatorio): T1 1,42–4,07 % → 78,79 % / 84,67 % · T2 4,07–5,94 % → 78,98 % / 80,63 % · T3 5,94–15,26 % → 84,06 % / 70,43 %.
- **Robustez:** con K recalculado **cada día** en vez de cada 5 días hábiles la cobertura global es 80,49 % (−0,10 pp); K se mantuvo entre 1,00 y 1,07 en todo el periodo.
- **Warm-up:** los primeros 60 cortes calibran K con menos de 60 observaciones (K entre 0 y 1,07) y el primer día la banda es degenerada (K=0); por eso se reportan también las cifras «estable» (≥60 cortes), casi idénticas (80,61 % vs 80,59 %). «Días hábiles» = filas de la serie BCRP (incluye algunos feriados con sesión).

**Lectura:** fuera de muestra el motor diario cubre **80,59 %**, muy cerca del 80 % nominal. El 80,03 % anterior salía por construcción y no lo demostraba, pero el walk-forward sí respalda la calibración. El paseo aleatorio es más estrecho y sale con mejor Winkler, pero subcubre (78,60 %) y se rompe justo cuando la volatilidad sube (70,43 % en el tercil alto): lo que sostiene la banda es el reescalado EWMA de FHS.

> **Frase pública verificable:** *Entre enero 2019 y noviembre 2026, recalculando K solo con la historia previa a cada día, el rango 80 % del motor diario (1 día hábil, FHS+EWMA, P50=paseo aleatorio) cubrió 80,59 % de los cierres reales (1958 cortes).*

## 3. Motor mensual — walk-forward 2013-2026, pero con calibración dentro del periodo

6 activos × 4 horizontes: cobertura 70,18–83,87 %; USD/PEN 74,79 % (1m), 76,07 % (3m), 78,95 % (6m), 76,85 % (12m); MAE del P50 peor que el paseo aleatorio en 23 de 24 combinaciones.

**¿Se ajustó la calibración con datos que caen dentro del periodo evaluado? Sí.**

- `api/_lib/calibration.json` (2026-10-22, `scripts/calibrate.js`): se calibró sobre historia mensual 2016-10→2026-10 de los 120 activos del catálogo —incluidos PEN=X, HG=F, GC=F, SI=F, CL=F y ZINC, los seis auditados— con orígenes móviles; k80/k50 se eligen en la primera mitad y se corrigen si la segunda mitad queda fuera de [75 %, 85 %]. Las constantes se ajustaron con datos del periodo evaluado: **la cobertura mensual es optimista**.
- `api/_lib/engine-params.json` (2026-10-30, `scripts/calibrate-engine.js`): percentil 80 de los factores «need» sobre **todos** los orígenes móviles de esa misma ventana 2016-10→2026-10, sin corte fuera de muestra → también se ajustó con datos dentro del periodo evaluado. Alimenta el Engine v6 (`api/_lib/engine.js`), no las bandas de `buildForecast`.
- Consecuencia: las coberturas del párrafo anterior miden el motor con la calibración internalizada; no son una prueba de cobertura.

## 4. Conclusión

1. **Motor diario: bien calibrado, y ahora demostrado fuera de muestra** (80,59 %; 78,09–83,25 % por año). Se puede publicar el rango con su cobertura nominal.
2. **Motor mensual: cobertura optimista.** El 74–79 % de USD/PEN no prueba que el motor falle por 5 pp y el k80 «necesario» (1,01–1,15) es indicativo. Para un OOS real hay que recalibrar k80 con una ventana que termine antes del periodo evaluado; hasta entonces el k80 actual (1,00–1,53) no debe presentarse como óptimo.
3. **P50:** en el diario el P50 es el paseo aleatorio (MAE 0,0100 vs 0,0101 con deriva EWMA); en el mensual el P50 es peor que el paseo aleatorio en 23 de 24 casos. El valor del producto es el rango, no el punto central.
4. **Pendiente:** validación OOS mensual con calibración anterior a 2016; después, ancho condicionado por noticias.

## Archivos

- `auditar-diario-real.mjs` → `resultados-diario-real.json`, `tabla-diario-real.md` y `~/v7/resultados/motor-diario-real.csv` (fuera de git; una fila por día: `fecha,cierre_base,p10,p90,cierre_real`) para que la rama de calibración compruebe su réplica.
- `auditar.mjs` → `resultados.json` (24 KB: no se borra, sigue bajo 200 KB) y `tabla.md` (mensual); `auditar-diario.mjs` → `resultados-diario.json` (en muestra).
