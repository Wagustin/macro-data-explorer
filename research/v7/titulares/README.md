# V7 · Titulares GDELT — Descarga estable de titulares históricos (Perú, 2019–hoy)

Descarga titulares de prensa peruana sobre economía/mercados desde **GDELT DOC 2.0 API** (`https://api.gdeltproject.org/api/v2/doc/doc`, modo `artlist`, formato JSON, `maxrecords=250`), cubriendo **2019-01-01 → hoy**.

**Datos:** `~/v7/data/titulares/` (fuera de git)
- `AAAA-MM.jsonl` — un JSON por línea: `{"fecha_disponible","titulo","dominio","url","idioma"}`
- `manifiesto.jsonl` — log de ventanas (una línea por ventana terminada/fallida)
- `estado.json` — estado en vivo (ventanas hechas/total, peticiones/hora, errores, ETA, pausa actual)
- `titulares.log` — log de ejecución en `~/v7/logs/`

---

## Características principales

| Requisito | Implementación |
|-----------|----------------|
| **Un solo proceso, una petición a la vez** | `fetchWindow` serial, `run.sh` con `flock` |
| **Pausa configurable + jitter ±20%** | `GDELT_PAUSA_S` (default 6s, mín 4s) |
| **Backoff exponencial 429/5xx/timeout/JSON** | 30s → 60s → 120s → 300s (máx 6 reintentos) |
| **429 duplica pausa base (máx 30s) y reduce -10% cada 20 éxitos** | `currentPause` dinámico, persiste en `estado.json` |
| **Respeta `Retry-After`** | Lee header en respuestas 429/503 |
| **20 fallos seguidos → duerme 30 min y continúa** | Nunca termina por error de red |
| **Ventanas adaptativas (1 día → 1 hora)** | Divide a la mitad si llega a 250; ensancha si pocos |
| **Reanudable e idempotente** | `manifiesto.jsonl` + `seen` global por URL normalizada |
| **Escritura atómica** | `.tmp` + `rename` en manifiesto, mensuales y estado |
| **Deduplicado por URL normalizada** | Quita hash, ordena query params |
| **Ejecución desatendida** | `run.sh` con `flock`, `nice -n 19`, `ionice -c3` |
| **systemd --user timer cada 15 min** | `titulares.service` + `titulares.timer` (sin sudo) |
| **Estado en `estado.json`** | Ventanas hechas/total, peticiones/hora, errores, ETA |

---

## Estructura del módulo

```
research/v7/titulares/
├── downloader.mjs      # Motor principal (Node ESM)
├── downloader.test.mjs # Tests (node --test)
├── run.sh              # Wrapper flock + nice + ionice
├── titulares.service   # systemd user service
├── titulares.timer     # systemd user timer (15 min)
├── cobertura.py        # Genera _cobertura.csv (ya existente)
└── README.md           # Este archivo
```

---

## Instalación y uso

### 1. Preparar directorios (una sola vez)
```bash
mkdir -p ~/v7/data/titulares ~/v7/logs
```

### 2. Probar una semana (probe)
```bash
cd /home/wagustin/kathy_workspace/wt-v7-titulares
node research/v7/titulares/downloader.mjs --probe
# Mide peticiones/día, raw, kept, splits, errors y estima ETA total
```

### 3. Ejecutar manualmente (foreground)
```bash
# Con pausa base 6s (default)
GDELT_PAUSA_S=6 node research/v7/titulares/downloader.mjs

# Con pausa base 4s (mínimo permitido)
GDELT_PAUSA_S=4 node research/v7/titulares/downloader.mjs
```

### 4. Ejecución desatendida (recomendada: systemd --user)

```bash
# Instalar unidades de usuario (sin sudo)
mkdir -p ~/.config/systemd/user
cp research/v7/titulares/titulares.service ~/.config/systemd/user/
cp research/v7/titulares/titulares.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now titulares.timer
```

**Ver estado:**
```bash
systemctl --user status titulares.timer
systemctl --user list-timers titulares.timer
```

**Ver logs en vivo:**
```bash
journalctl --user -u titulares -f
# o también:
tail -f ~/v7/logs/titulares.log
```

**Pausar / Reanudar:**
```bash
systemctl --user stop titulares.timer   # pausa (termina la ventana actual)
systemctl --user start titulares.timer  # reanuda
```

**Detener todo:**
```bash
systemctl --user stop titulares.service titulares.timer
```

**Desinstalar:**
```bash
systemctl --user disable --now titulares.timer
rm ~/.config/systemd/user/titulares.service ~/.config/systemd/user/titulares.timer
systemctl --user daemon-reload
```

### 5. Alternativa: cron (si no usas systemd --user)
```bash
# Editar crontab: crontab -e
# Cada 15 min, con flock para evitar solapamiento:
*/15 * * * * cd /home/wagustin/kathy_workspace/wt-v7-titulares && flock -n /home/wagustin/v7/data/titulares/.cron.lock -c 'nice -n 19 ionice -c3 node research/v7/titulares/downloader.mjs >> /home/wagustin/v7/logs/titulares-cron.log 2>&1'
```

---

## Ver progreso y estado

**Estado rápido (`estado.json`):**
```bash
cat ~/v7/data/titulares/estado.json | jq .
# {
#   "ventanas_hechas": 1234,
#   "ventanas_total": 2869,
#   "peticiones_hora": 580,
#   "eta_horas": 4.2,
#   "pausa_actual_s": 6,
#   "ultimo_progreso": "2026-11-09T14:32:10.123Z",
#   "errores_recientes": [...]
# }
```

**Cobertura mensual:**
```bash
python3 research/v7/titulares/cobertura.py
# Genera ~/v7/data/titulares/_cobertura.csv
#   mes,n_titulares
#   2019-01,1234
#   2019-02,987
#   ...
```

**Log de ejecución:**
```bash
tail -f ~/v7/logs/titulares.log
# 2026-11-09T14:32:10.123Z OK 2026-11-08/2026-11-08: 45 raw, 12 kept, pausa=6s, peticiones/hora=580, ETA=4.2h
# 2026-11-09T14:32:16.456Z MAXFILL 2026-11-07/2026-11-07 = 250; se divide en 2 subventanas
# 2026-11-09T14:33:20.789Z 429/503 ventana 2026-11-06->2026-11-06 intento 1/6, espera 30s
```

**Manifiesto (ventanas procesadas):**
```bash
wc -l ~/v7/data/titulares/manifiesto.jsonl
# Cada línea: {"key":"2026-11-08/2026-11-08","start":"...","end":"...","status":"done","attempts":1,"titulares":12,"timestamp":"..."}
```

---

## Presupuesto de peticiones y ETA (Regla 6)

### Estimación teórica
- **Rango:** 2019-01-01 → hoy ≈ 2 869 días
- **Ventana inicial:** 1 día → ~2 869 ventanas base
- **Splits:** Cada ventana que llega a 250 se divide. Experiencia histórica: ~1.3–1.5x ventanas base.
- **Total estimado:** **3 500 – 4 300 peticiones**

### Ritmo y ETA con pausa base
| Pausa base | Peticiones/hora (teórico) | ETA (3 500 req) | ETA (4 300 req) |
|------------|---------------------------|-----------------|-----------------|
| 6 s (default) | 600 | **5.8 h** | **7.2 h** |
| 5 s | 720 | 4.9 h | 6.0 h |
| 4 s (mínimo) | 900 | 3.9 h | **4.8 h** |

> **Conclusión:** Con la pausa por defecto (6 s) la ETA teórica está **bien por debajo de 36 h**. Incluso con retries y backoff reales (que reducen el throughput efectivo a ~50–70%), la ETA realista es **8–15 h**, dentro del objetivo.

### Ajuste automático de pausa
- Si hay 429, la pausa base **sube** (hasta 30 s) y **baja** gradualmente (-10% cada 20 éxitos).
- El sistema se auto-regula para mantener el máximo throughput sin saturar la API.
- Para forzar más velocidad: `GDELT_PAUSA_S=4` (mínimo permitido por el brief).

---

## Tests

```bash
# Ejecutar todos los tests del módulo
node --test research/v7/titulares/downloader.test.mjs

# Tests del proyecto completo
npm test
```

**Cobertura de tests:**
- ✅ Normalización de URLs (hash, query params)
- ✅ Parseo de `seendate` GDELT
- ✅ Filtrado de artículos (idioma español + keywords economía)
- ✅ División de ventanas (hasta 1 hora mínimo)
- ✅ Generación de ventanas newest-first
- ✅ Jitter ±20% en pausa
- ✅ Backoff exponencial 30→60→120→300s (cap)
- ✅ Reducción de pausa -10% cada 20 éxitos
- ✅ Escritura atómica manifiesto (tmp + rename)
- ✅ Escritura atómica estado.json
- ✅ Lock `flock` anti-concurrencia
- ✅ Mock fetch: retry en 429 con `Retry-After`
- ✅ Mock fetch: abandono tras max reintentos
- ✅ Deduplicado por URL normalizada

---

## Formato de datos (CONVENCIONES)

`~/v7/data/titulares/AAAA-MM.jsonl` — una línea por titular:
```json
{"fecha_disponible":"2026-11-06","titulo":"BCRP mantiene tasa de referencia en 5.75%","dominio":"gestión.pe","url":"https://gestión.pe/economia/bcrp-tasa-...","idioma":"Spanish"}
```

- `fecha_disponible`: fecha UTC de publicación (`seendate` → `AAAA-MM-DD`)
- `titulo`: título limpio (espacios normalizados)
- `dominio`: dominio origen (según GDELT)
- `url`: URL original (deduplicada globalmente por URL normalizada)
- `idioma`: `"Spanish"` (o el que reporte GDELT)

---

## Limitaciones documentadas (resultados negativos)

1. **Throttle GDELT por IP** — El mensaje "Please limit requests to one every 5 seconds" puede significar bloqueo de horas. La estrategia (pausa base 6s + jitter + backoff 30–300s) convive con ello.
2. **Consultas con términos → 429/{}** — El OR-group del brief (`dolar OR tipo de cambio OR BCRP ...`) no responde. El fetch fiable es `sourcecountry:PE` + filtro cliente (regex economía).
3. **Ventana 1 día + maxrecords=250** — Puede llenarse con prensa general; la división adaptativa mitiga.
4. **Idioma** — GDELT reporta `language: "Spanish"`. Se exige Spanish (o vacío + regex economía). Inglés sobre Perú queda fuera por diseño.

---

## Licencia

Ver `~/v7/data/titulares/_licencias.md` (GDELT: uso libre con cita; titulares son metadatos para investigación interna, no se republikan).

---

## Commit único

Este módulo se entrega en **un solo commit** con mensaje en inglés terminado en:
```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

Sin push ni despliegue. No toca `.env`.