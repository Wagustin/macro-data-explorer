# V7 · R1 — Estado del arte de modelos fundacionales de series temporales

*Solo investigación. Ningún modelo se ha ejecutado; todas las cifras provienen de la API de
Hugging Face (`/api/models` + fichas `README.md` vía `curl`), de PyPI y de los repositorios
oficiales, verificados el 2026-11-09 (zona UTC). Referencia en producción hoy: `scripts/chronos_batch.py`
+ `.github/workflows/timesfm.yml` usan `google/timesfm-2.5-200m-pytorch` (200M, Apache-2.0) y
`amazon/chronos-2` (120M, Apache-2.0) en CPU.*

> **Respuesta breve a «¿hay versión posterior a TimesFM 2.5?» — Sí: TimesFM 3.0.**
> `google/timesfm-3.0-pytorch` (2026-09-02) es el sucesor de 2.5: 330M parámetros, multivariado
> nativo en un solo pase, con covariables futuras conocidas. **Licencia: TimesFM Non-Commercial
> License v1.0** (la ficha la declara `other` / `timesfm-non-commercial-license-v1.0`,
> `LICENSE` del repo). Por tanto **no es apta para producción comercial de PerData** sin
> autorización de Google. El 2.5 en producción sigue siendo Apache-2.0.

## 1. Tabla comparativa (modelos con licencia clara; verificada con `curl` el 2026-11-09)

| Modelo (HF) | Versión / fecha API | Params | Licencia exacta | ¿Comercial? | Covariables | Cuantiles nativos | Contexto | Disco (safetensors) | 4 GB GPU / CPU | Instalación (PyPI) |
|---|---|---|---|---|---|---|---|---|---|---|
| **TimesFM 2.5** `google/timesfm-2.5-200m-pytorch` | 2.5 · lastMod 2025-10-02 | 200M | Apache-2.0 | Sí | No (envoltorio externo XReg) | Sí, 9 (0.1–0.9) + cabeza continua | 1024 (config) / 256 horizonte | 925 MB | CPU sí; GPU 4 GB sí (1 GB pesos) | `pip install "timesfm==3.0.2"` + `timesfm` GitHub (`pip install -e .`) / `TimesFM_2p5_200M_torch.from_pretrained` |
| **TimesFM 3.0** `google/timesfm-3.0-pytorch` | 3.0 · lastMod 2026-09-02 | 330M (20×1280) | **TimesFM Non-Commercial-1.0** (`other`) | **No** sin permiso | Sí (past + past-future, en una pasada) | Sí, 9 (0.1–0.9) | patches 32/64; horizonte completo en 1 pasada | 1.32 GB | CPU sí; GPU 4 GB sí (justo) | `pip install "timesfm==3.0.2"` (misma API) — pesos desde HF `google/timesfm-3.0-pytorch` |
| **Chronos-2** `amazon/chronos-2` | 2 · lastMod 2026-06-05 | 120M (T5-encoder, d=768, 12 capas) | Apache-2.0 | Sí | **Sí, nativo** (uni + multivariado + past-only + future-known) | Sí, 21 cuantiles 0.01–0.99 | 8192 (pred ≤1024) | 478 MB | CPU sí (ya en `~/v7`); GPU 4 GB sí | `pip install "chronos-forecasting>=2.0"` → 2.3.2; `Chronos2Pipeline.from_pretrained("amazon/chronos-2")` |
| **Chronos-Bolt Tiny** `amazon/chronos-bolt-tiny` | Bolt · lastMod 2025-11-21 | 9M | Apache-2.0 | Sí | No nativo (vía AutoGluon XReg) | Sí (direct multi-step) | 2048 (Bolt) | 35 MB | CPU/GPU 4 GB sobrados | `pip install "chronos-forecasting>=2.0"` / `BaseChronosPipeline` |
| **Chronos-Bolt Mini** `amazon/chronos-bolt-mini` | Bolt · lastMod 2025-11-21 | 21M | Apache-2.0 | Sí | No nativo | Sí | 2048 | 85 MB | Sí / sí | idem |
| **Chronos-Bolt Small** `amazon/chronos-bolt-small` | Bolt · lastMod 2025-11-21 | 48M | Apache-2.0 | Sí | No nativo | Sí | 2048 | 191 MB | Sí / sí | idem |
| **Chronos-Bolt Base** `amazon/chronos-bolt-base` | Bolt · lastMod 2025-11-21 | 205M | Apache-2.0 | Sí | No nativo | Sí | 2048 | 821 MB | CPU sí; GPU 4 GB sí | idem (usado en `timesfm.yml` como respaldo) |
| **Toto 2.0-22m** `Datadog/Toto-2.0-22m` | 2.0 · lastMod 2026-06-04 | 22M | Apache-2.0 | Sí | Sí (exógenas; finetune/inferencia, multivariado) | Sí, 9 (0.1–0.9) | variable (decoder-only; ejemplo 512–1024) | 88 MB (fp32; tabla oficial 84 MB) | CPU/GPU 4 GB sobrados | `pip install toto-models` (1.0.0); `Toto2Model.from_pretrained("Datadog/Toto-2.0-22m")` |
| **Toto 2.0-313m** `Datadog/Toto-2.0-313m` | 2.0 · lastMod 2026-06-04 | 313M | Apache-2.0 | Sí | Sí | Sí, 9 | variable | 1.25 GB (oficial 1.2 GB) | CPU sí; GPU 4 GB sí (1.25 GB pesos) | idem |
| **Toto 2.0-1B** `Datadog/Toto-2.0-1B` | 2.0 · lastMod 2026-06-04 | 1B | Apache-2.0 | Sí | Sí | Sí, 9 | variable | 4.16 GB (oficial 3.9 GB fp32) | CPU sí; **GPU 4 GB no** (pesos ≈ memoria total) | idem |
| **Toto 2.0-2.5B** `Datadog/Toto-2.0-2.5B` | 2.0 · lastMod 2026-06-04 | 2.5B | Apache-2.0 | Sí | Sí | Sí, 9 | variable | 9.8 GB (oficial 9.1 GB) | CPU sí (lento); GPU 4 GB no | idem |
| **Toto Open-Base-1.0** `Datadog/Toto-Open-Base-1.0` | 1.0 · lastMod 2026-05-14 | — (fam. previa) | Apache-2.0 | Sí | Sí (exógenas) | Sí | variable | (≈ 100–300 MB según tamaño) | CPU/GPU 4 GB según tamaño | `pip install toto-models` |
| **Sundial Base-128m** `thuml/sundial-base-128m` | 1.0/Timer-3.0 · lastMod 2026-03-09 | 128M (768, 12 capas) | Apache-2.0 | Sí | No (generativo univariado) | Indirectos: muestras → cuantiles/IC | 2880 (patch 16; salida hasta 720) | 513 MB | CPU sí; GPU 4 GB sí | `pip install transformers==4.40.1` + `AutoModelForCausalLM.from_pretrained("thuml/sundial-base-128m", trust_remote_code=True)` |
| **Moirai 2.0-R-Small** `Salesforce/moirai-2.0-R-small` | 2.0 · lastMod 2026-01-29 | 14M (d=384, 6 capas) | **CC-BY-NC-4.0** | **No** (no comercial) | Sí (multivariado + `feat_dynamic_real` / past / future) | Sí, 9 (0.1–0.9) | 512 (patch 16) | 46 MB | CPU/GPU 4 GB sobrados | `pip install uni2ts` (2.0.0) / clon `SalesforceAIResearch/uni2ts` + `pip install -e '.[notebook]'` |
| **Moirai-MoE-Small** `Salesforce/moirai-moe-1.0-R-small` | 1.0 · lastMod 2025-01-21 | 37M aprox. (MoE) | CC-BY-NC-4.0 | **No** | Sí (multivariado) | Distribución mixta (Student-t + normal + NB + log-normal) → cuantiles por muestreo | 512 | — | CPU sí; GPU 4 GB sí | `pip install uni2ts` |
| **Moirai-PoE-Base/Large** `Salesforce/moirai-moe-1.0-R-base` | 1.0 · lastMod 2025-01-21 | 3.7 GB pesos (744M activos aprox.) | CC-BY-NC-4.0 | **No** | Sí | Mezcla distribucional | 512 | 3.74 GB | CPU sí; GPU 4 GB no | `pip install uni2ts` |
| **TiRex 1.0** `NX-AI/TiRex` | 1.0 · lastMod 2026-02-05 | 35M (xLSTM) | **NXAI Community (attribution, `other`)** | **Descartado** (atribución obligatoria + umbral €100M) | No (univariado) | Sí (cuantiles 0.1–0.9) | largo (sin límite rígido) | 141 MB (`.ckpt`) + 142 MB ONNX | CPU/GPU 4 GB sí | `pip install tirex-ts` (1.4.2) |
| **TiRex 2** `NX-AI/TiRex-2` | 2 · lastMod 2026-10-07 | 330 MB safetensors (~80M) | Apache-2.0 (ver nota) | Sí | No (univariado) | Sí, 9 (0.1–0.9) | 2048 (patch 32) | 330 MB | CPU/GPU 4 GB sí | `pip install tirex-ts` (1.4.2) |
| **Lag-Llama** `time-series-foundation-models/Lag-Llama` | 1.0 · lastMod 2024-05-14 (sin cambios) | 2.4M* / 200M** | Apache-2.0 | Sí | No nativo | Distribución por paso → cuantiles | 32 entrenado (RoPE extensible a 1024) | 9.8 MB | CPU/GPU 4 GB sobrados | GitHub `time-series-foundation-models/lag-llama` (sin PyPI) |
| **VisionTS++** `Lefei/VisionTSpp` | ++ · lastMod 2025-11-09 | Base ≈ 115M (MAE-ViT) / Large ≈ 333M | MIT | Sí | Sí (multivariado vía RGB) | Sí (cabezas paralelas) | imagen (≳512) | 460 MB (base) / 1.33 GB (large) | CPU sí; GPU 4 GB sí | `pip install visionts` (1.0.1) |
| **Kumo-Forecast** `nvidia/Kumo-Forecast` | 1.2.0 · lastMod 2026-10-27 | ~340M (MOMENT-1-large + cabeza) | Apache-2.0 | Sí | No (DARR: retrieval de contexto histórico) | Puntual + patrón (kNN); cuantiles no nativos | 256–2048 | 1.31–1.42 GB (`.pt`) | CPU sí; GPU 4 GB sí (1.4 GB pesos) | `kumo-ts` (librería NVIDIA, no PyPI estándar) |
| **Granite-TTM-R3** `ibm-granite/granite-timeseries-ttm-r3` | R3 · lastMod 2026-07-02 | 1–35M (MoE mixers, D=128) | Apache-2.0 | Sí | **Sí (exógenas/controles)** | Sí (multi-quantile head) | 512 | 5.7 MB | CPU/GPU 4 GB sobrados (ultra-rápido) | `pip install granite-ts` / `from granitetm import TTM` (vía `granite-timeseries` HF) |
| **Cisco TSM 1.0** `cisco-ai/cisco-time-series-model-1.0` | 1.0 · lastMod 2026-04-24 | 250M (25 capas) | Apache-2.0 | Sí | No (multirresolución, univariado) | Sí, 15 (0.01–0.99) | 512 fino + 512 grueso (30 720 util) | 1.02 GB | CPU sí; GPU 4 GB sí | `uv pip install cisco-tsm` / `from cisco_tsm import CiscoTsmMR` |

\* Lag-Llama: el paper reporta ~2.4M parámetros activos con contexto corto; el `.safetensors` de 9.8 MB
corresponde a ese tamaño fp32. \*\* La confusión «200M» proviene de TimesFM — Lag-Llama es dos órdenes
de magnitud menor; se lista para no repetirla.

Fuentes de tamaños: cabeceras `Content-Length` de `…/resolve/main/model.safetensors` (y para
TiRex/Kumo, `.ckpt`/`.pt`); parámetros de `config.json` + README oficial de cada repo.
Descargas/medias de uso (API, 2026-11-09): Chronos-2 8.0M, TimesFM-2.5 1.78M, TimesFM-3.0 0.55M,
Toto-2.0-22m 251k, Moirai-2.0 261k, TiRex 138k, TTM-R3 1.9M (el más descargado de los nuevos).

## 2. Modelo por modelo: ficha breve

### 2.1 TimesFM 2.5 (Google) — referencia a batir
Repos: `google/timesfm-2.5-200m-pytorch` (Apache-2.0, 2025-10-02, 1.78M descargas),
`-transformers` mirror 2026-04-10 (Apache-2.0). 200M decoder-only, contexto 1024 / horizonte 256,
cuantiles 0.1–0.9 (cabeza continua), normalización por instancia, `force_flip_invariance`,
`fix_quantile_crossing`, `infer_is_positive`. Instalación local ya probada: `~/v7-env` tiene
`timesfm 3.0.2` y el snapshot `google/timesfm-2.5-200m-pytorch` `1d952420` (925 MB). En el
pipeline PerData actual (`scripts/chronos_batch.py`) alimenta el motor con 48 meses y
`infer_is_positive=True`. **Apto comercial: sí.**

### 2.2 TimesFM 3.0 (Google) — sucesor, pero NON-COMMERCIAL
`google/timesfm-3.0-pytorch` (2026-09-02, 553k descargas, 1012 likes). Blog Google Research
2026-08-31: 330M, corpus >1 T de puntos, multivariado nativo (múltiples targets + covariables
past y past-future) en una sola pasada (masking contiguo de parches), 9 cuantiles. Ocupa el
nº 1 en GiftEval / fev-bench / TIME según Google (frente a Chronos-2, Toto-2.0 y TimesFM-2.5).
Licencia del repo: **TimesFM Non-Commercial License v1.0** (`license: other` en la API,
`license_name: timesfm-non-commercial-license-v1.0`). No permite uso comercial sin permiso
expreso de Google. Para PerData: queda como *benchmark de laboratorio*, no candidato a producción.

### 2.3 Chronos-2 (Amazon) — ya instalado
`amazon/chronos-2` (2025-10-30 creado, lastMod 2026-06-05; 8.0M descargas). 120M encoder-only
(T5, d=768, 12 capas, 12 cabezas), patch 16, **contexto 8192 / predicción ≤1024**, 21 cuantiles
(0.01–0.99). Único de la familia con **covariables nativas**: univariado, multivariado y
covariate-informed (past-only y future-known) con group-attention, patentado en el paper
2510.15821. Soporte CPU directo (usado en `timesfm.yml` con `device_map="cpu"`, contexto 200+ sin
problema; 300 series/s en A10G). Instalación: `pip install "chronos-forecasting>=2.0"` (última
2.3.2, ya en `~/v7-env`), `Chronos2Pipeline.from_pretrained("amazon/chronos-2")`. Apache-2.0:
**comercial: sí**. Pesos 478 MB → cabe en GPU de 4 GB y en CPU.

### 2.4 Chronos-Bolt (Amazon) — familia rápida
Tiny 9M (35 MB), Mini 21M (85 MB), Small 48M (191 MB), Base 205M (821 MB); lastMod 2025-11-21,
Apache-2.0, contexto 2048, cuantiles nativos, sin covariables nativas (vía AutoGluon XReg).
Los tres pequeños caben sobrados en GPU 4 GB / CPU; Base pesa como TimesFM-2.5. Ya se usan en
`timesfm.yml` como respaldo rápido. Instalación: mismo `chronos-forecasting`.

### 2.5 Toto 2.0 (Datadog) — la familia que más crece
`Datadog/Toto-2.0-{4m,22m,313m,1B,2.5B}` (creados 2026-04-14, lastMod 2026-06-04). Todos Apache-2.0.
Receta única u-μP, arquitecturas decoder-only con atención alterna tiempo/variate, 9 cuantiles,
arcsinh scaler, CPM single-pass. Pesos: 22m = 88 MB (oficial 84 MB), 313m = 1.25 GB, 1B = 4.16 GB,
2.5B = 9.8 GB. Exógenas oficialmente soportadas (GitHub `DataDog/toto`: «Feb 2026 — exogenous
covariate support added»). Líder en BOOM, GIFT-Eval y TIME (top-3 en todos; 2.5B nº 1).
Instalación: `pip install toto-models` (1.0.0, único release PyPI) → `Toto2Model.from_pretrained`.
El 22m (84 MB) y el 313m (1.2 GB) caben en GPU 4 GB y CPU sin dificultad; 1B/2.5B solo CPU.

### 2.6 Sundial (THUML) — generativo Apache-2.0
`thuml/sundial-base-128m` (ICML 2025 Oral, TIMER 3.0). 128M, 513 MB, contexto 2880, salida hasta
720, cuantiles derivados de muestras (cualquier estadístico). Apache-2.0: comercial sí. Sin
covariables nativas. Instalación con `transformers==4.40.1` + `trust_remote_code`. 1º en MASE de
GIFT-Eval (2025-05). CPU/GPU 4 GB sí.

### 2.7 Moirai 2.0 / Moirai-MoE (Salesforce) — DESCARTADO comercial
`Salesforce/moirai-2.0-R-small` (2026-01-29, 261k descargas) y `moirai-moe-1.0-R-*` (2025-01-21),
todos **CC-BY-NC-4.0**: «release for research purposes only». 2.0-R-small 14M / 46 MB / contexto 512,
9 cuantiles, multivariado con `feat_dynamic_real` (past + future). MoE: mezcla
Student-t/normal/NB/log-normal; Base 3.7 GB. Instalación `pip install uni2ts` (2.0.0). **No entra en
producción comercial de PerData** (NC), aunque sea el mejor ejemplo de covariables junto con Chronos-2.

### 2.8 TiRex (NXAI) — DESCARTADO por licencia (regla del brief)
TiRex 1.0 `NX-AI/TiRex` (35M xLSTM, 2025-05-26): licencia **NXAI Community** (atribución obligatoria
«Built with technology from NXAI» + pago si >€100M de ingresos). El brief lo descarta explícitamente.
**TiRex-2** `NX-AI/TiRex-2` (2026-10-07, 330 MB, contexto 2048, 9 cuantiles, Apache-2.0 según
`cardData` + `LICENSE`) queda *no descartado técnicamente*, pero conviene tratarlo con cautela
(licencia cambiada respecto a v1; verificar antes de produc_ir). Instalación `pip install tirex-ts` 1.4.2.

### 2.9 Lag-Llama — histórico
`time-series-foundation-models/Lag-Llama` (2024-02-07, sin cambios desde 2024-05-14). Apache-2.0.
Probabilístico (distribución por paso), contexto 32 entrenado extensible con RoPE (recomendado 1024),
2.4M params (9.8 MB). Sin PyPI (clon de GitHub). Solo referencia académica.

### 2.10 VisionTS++ (Lefei) — cruzado visión↔series
`Lefei/VisionTSpp` (2025-11-09, 0 descargas). MIT. MAE-ViT continuado; Base 460 MB / Large 1.33 GB;
multivariado vía RGB, cuantiles por cabezas paralelas. `pip install visionts` (1.0.1). Cabe en
GPU 4 GB (Base) / CPU.

### 2.11 Otros publicados en 2025–2026 verificados
- **Kumo-Forecast** `nvidia/Kumo-Forecast` (2026-04-07, 1.2.0, Apache-2.0, ~340M MOMENT-1-large,
  contexto 256–2048, DARR retrieval kNN, no cuantiles nativos; 1.3–1.4 GB en `.pt`). Cabe en 4 GB.
- **Granite-TTM-R3** `ibm-granite/granite-timeseries-ttm-r3` (2026-05-21, R3, Apache-2.0,
  1–35M MoE mixers, contexto 512, multi-quantile head, **exógenas/controles**, 5.7 MB,
  180 samples/s CPU / 7 500 GPU). El más liviano y rápido de los nuevos; 1.9M descargas.
- **Cisco TSM 1.0** `cisco-ai/cisco-time-series-model-1.0` (2026-04-24, Apache-2.0, 250M,
  contexto multirresolución 512+512 (30 720 útil), 15 cuantiles 0.01–0.99, univariado, 1.02 GB).
  Instalación `uv pip install cisco-tsm`.
- **Timestral-209M** `mistralai/Timestral-209M` (209M, licencia Mistral con umbral $20M/mes) —
  descartado comercial para PerData por igual razón que TiRex-1.0.
- **EXAONE-Forecast** `LG-AI-Research/EXAONE-Forecast-for-Finance-1.0` (2026-09-03, licencia `other`) —
  descartado comercial sin revisar.

## 3. Compatibilidad con la GTX 1650 de 4 GB y con CPU

| Grupo | GPU 4 GB | CPU (16 GB RAM, Actions) |
|---|---|---|
| ≤250 MB pesos (Bolt Tiny/Mini/Small, Toto 22m, Moirai-2.0, TiRex, Lag-Llama, TTM-R3, Sundial, VisionTS-base) | ✅ | ✅ |
| 400–830 MB (Chronos-2 478 MB, TimesFM-2.5 925 MB, Bolt-Base 821 MB, Sundial 513 MB) | ✅ (pesos < 1 GB) | ✅ |
| 1.0–1.5 GB (Toto-313m 1.25 GB, TimesFM-3.0 1.32 GB, Kumo 1.4 GB, VisionTS-large 1.33 GB, Cisco 1.02 GB) | ✅ justo (pesos < 50% VRAM) | ✅ |
| 3.7–9.8 GB (Moirai-MoE-Base 3.74 GB, Toto-1B 4.16 GB, Toto-2.5B 9.8 GB) | ❌ | ✅ (lento) |

El entorno local ya corroborado (`ENV_OK`): `~/v7-env` con `torch 2.15.0+cpu`
(`torch.cuda.is_available() == False`) ejecuta Chronos-2 (0.1 s / serie toy) y TimesFM-2.5
(2.3 s) en CPU; la GTX 1650 no se usa por espacio (decisión documentada en `wt-v7-env`).
En GitHub Actions (4 vCPU / 16 GB) todos los candidatos ≤1.5 GB corren en CPU sin problema un
job de ≤60 min.

## 4. Recomendación — hasta 4 candidatos a comparar frente a TimesFM 2.5

Orden por (licencia comercial ✓) × (covariables nativas) × (tamaño ≤1.5 GB / CPU) ×
(instala con pip + ya corre en `timesfm.yml`):

1. **Chronos-2** (`amazon/chronos-2`, 120M, Apache-2.0) — *ya es la referencia alternativa en
   producción*. Único de la lista con covariables nativas completas (past-only y future-known,
   univariado + multivariado), contexto 8192 (≫ 48 meses del motor), 21 cuantiles, 478 MB,
   8.0M descargas, idéntica API que los Bolt ya en `timesfm.yml`. Comparación inmediata en el
   harness walk-forward 2019–2024 (2019-01-02 → 2025-01-01).
2. **Toto-2.0-313m** (`Datadog/Toto-2.0-313m`, 313M, Apache-2.0; fallback 22m = 88 MB) — SOTA en
   BOOM/GIFT-Eval/TIME, multivariado con exógenas, single-pass CPM, 9 cuantiles. El 313m (1.25 GB)
   cabe en GPU 4 GB y CPU; si el harness CPU tarda demasiado, el 22m ofrece la misma receta a 1/15
   del tamaño. Instalación `pip install toto-models`.
3. **Sundial Base-128m** (`thuml/sundial-base-128m`, 128M, Apache-2.0) — contrapunto generativo
   (muestreo → cuantiles) frente a cabeza de cuantiles de TimesFM/Chronos/Toto; 1º MASE en
   GIFT-Eval, contexto 2880, Apache-2.0, 513 MB CPU/GPU 4 GB. Instalación `transformers==4.40.1`.
4. **Granite-TTM-R3** (`ibm-granite/granite-timeseries-ttm-r3`, ≤35M, Apache-2.0, exógenas,
   multi-quantile, 5.7 MB, 180 samples/s en CPU) — candidato *eficiente*: si PerData necesita
   barrer muchos cortes walk-forward por comercial ( Actions CPU), el TTM da un orden de magnitud
   menos coste a cambio de ~0.005–0.01 de MASE/CRPS según su ficha. Instalación `granite-ts`.

**Descartados para producción comercial (aunque buenos en benchmark):** TimesFM-3.0
(Non-Commercial-1.0), Moirai-2.0/MoE (CC-BY-NC-4.0), TiRex-1.0 (NXAI Community),
Timestral/EXAONE (licencias con umbral). TiRex-2 (Apache-2.0) puede entrar como 5º
comparador de laboratorio si se verifica su licencia antes de cualquier uso.

## 5. Cómo se verifica (reproducibilidad)

```bash
# API + ficha (lo pedido en el brief)
curl -s "https://huggingface.co/api/models?search=timesfm&sort=lastModified&direction=-1&limit=50"
curl -s "https://huggingface.co/api/models/google/timesfm-3.0-pytorch"  # license, lastModified, siblings
curl -s "https://huggingface.co/google/timesfm-3.0-pytorch/raw/main/README.md"
curl -s "https://huggingface.co/amazon/chronos-2/raw/main/config.json"   # d_model 768, ctx 8192, 21 quantiles
curl -sL "https://huggingface.co/amazon/chronos-2/resolve/main/model.safetensors" -I  # Content-Length 477930472

# PyPI
/home/wagustin/v7-env/bin/pip index versions timesfm          # 3.0.2
/home/wagustin/v7-env/bin/pip index versions chronos-forecasting  # 2.3.2
/home/wagustin/v7-env/bin/pip index versions toto-models      # 1.0.0
/home/wagustin/v7-env/bin/pip index versions uni2ts          # 2.0.0
/home/wagustin/v7-env/bin/pip index versions tirex-ts        # 1.4.2
/home/wagustin/v7-env/bin/pip index versions visionts        # 1.0.1
```
