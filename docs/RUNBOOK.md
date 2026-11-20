# Runbook de incidentes de PerData

Este manual sirve a dos lectores: las personas que atienden un incidente y el vigía automático. El catálogo de códigos, acciones y límites es la fuente única (`handoff/vigia-catalogo.md`, fuera de este repo). Si este documento y el catálogo discrepan, manda el catálogo.

Repositorio: `Wagustin/macro-data-explorer` (rama `main`). Web en https://perdata.site, servida por el Worker `perdata-cf` (`wrangler.jsonc`).

## 1. Propósito y regla de oro

Este runbook describe cómo se detectan, comprueban y resuelven los incidentes de PerData: datos que no se actualizan, workflows de GitHub Actions que fallan, páginas caídas o pagos abiertos por error. Define qué puede hacer el vigía automático y qué queda reservado a Claude o a Agustín.

Regla de oro (del catálogo):

> El vigía NUNCA cambia código, diseño, textos, datos a mano, variables, DNS ni cuentas. Solo usa estas acciones: RELANZAR, ESPERAR, DESPLEGAR, VOLVER_ATRAS y AVISAR.

Acciones permitidas:

- **RELANZAR `<workflow.yml>`**: `gh workflow run <archivo> -R Wagustin/macro-data-explorer`.
- **ESPERAR**: no hacer nada en esta pasada y volver a mirar en la siguiente (cada 30 min).
- **DESPLEGAR**: `gh workflow run deploy.yml` (despliega origin/main, que ya pasó CI) y comprobar el smoke en la siguiente pasada.
- **VOLVER_ATRAS**: `npx wrangler rollback` a la versión anterior del Worker, solo si el smoke de producción falla dos pasadas seguidas DESPUÉS de un DESPLEGAR.
- **AVISAR**: correo a Agustín con el diagnóstico (y nada más).

Límites: como mucho 2 RELANZAR por workflow y día; 1 DESPLEGAR y 1 VOLVER_ATRAS por día. Al pasar el límite, AVISAR. Nunca actuar si el mismo workflow está en curso (status `in_progress` o `queued`).

## 2. Mapa del sistema

**Workflows** (`.github/workflows/`, 24 archivos; el nombre que muestra GitHub está entre paréntesis):

- **Motor y noticias**: `timesfm.yml` (Proyecciones diarias, 11:07 UTC; bloque `forecasts`), `noticias-dia.yml` (Noticias del día para el motor, 10:20 UTC), `news.yml` (Noticias financieras, cada 3 h; bloque `news`).
- **Mercado de Lima**: `smv.yml` (Hechos de importancia SMV, 01:23 y 05:53 UTC), `smv-precios.yml` (Cotizaciones de Lima SMV, martes a sábado 01:23 UTC; bloque `smv`).
- **Datos oficiales y cierres**: `official-data.yml` (BCRP, EIA, Banco Mundial, SUNAT, Reserva Federal; bloques `bcrp` y `eia`), `cierre-ayer.yml` (Cierre de ayer SUNAT), `cierre-tarde.yml` (Cierre de la 1:30 p. m.).
- **Publicación y avisos**: `boletin.yml` (Boletín diario), `alertas.yml` (Avisos de precio, cada 30 min), `d1-backfill.yml` (Copiar datos a D1; bloque `d1Sync`), `backup.yml` (Supabase backup, manual; bloque `backup`).
- **Despliegue y vigilancia**: `ci.yml` (CI), `deploy.yml` (Despliegue del Worker; manual, y también al terminar Datos oficiales, Cotizaciones de Lima o Boletín), `watchdog.yml` (cada hora en el minuto 17, y pruebas completas a las 12:41 UTC).
- **Fuera del vigía** (investigación, pruebas y reportes): `backtest.yml`, `css-coverage.yml`, `cls-trace.yml`, `exportar-cotizaciones.yml`, `lighthouse.yml`, `torneo.yml`, `v7-gdeltserie.yml`, `v7-harness.yml`, `visual.yml`.

**Cron del Worker**: `wrangler.jsonc` declara `*/30 * * * *`; `scheduled()` en `worker.js` (línea 661) llama a `dispatchDueWorkflows` y a `runBackup` (copia diaria del Worker). La lista `JOBS` (`worker.js`, línea 689) relanza los workflows atrasados: `watchdog`, `news`, `smv`, `smv-precios`, `timesfm`, `official-data`, `noticias-dia`, `cierre-ayer`, `alertas`, `boletin` y `cierre-tarde`. Cada entrada tiene `due()` (ventana horaria), `minGapMin` (no relanza si la última ejecución es más reciente) y, en algunos casos, `check()` (solo si falta el dato del día). Usa el secreto `GH_DISPATCH_TOKEN`.

**Cron del servidor**: `scripts/dispatch-backup.sh <workflow.yml> <max_age_minutes>` relanza un workflow solo si su última ejecución es más antigua que el umbral. Es la red de seguridad cuando GitHub retrasa o salta sus cron. La crontab del servidor no está en el repo.

**Bloques de `/api/status`** (`api/status.js`), con su workflow dueño y su umbral `staleAfterHours`:

- `forecasts` (Supabase, 30 h) → `timesfm.yml`.
- `news` (`data/noticias.json`, 6 h) → `news.yml`.
- `smv` (`cotizaciones_smv`, 96 h) → `smv-precios.yml`.
- `bcrp` (96 h) y `eia` (240 h) → `official-data.yml`.
- `d1Sync` (`sync_meta` en D1, 30 h) → `d1-backfill.yml`.
- `backup` (campos `fecha`, `bytes`, `edadHoras`) → copia diaria del Worker; `backup.yml` es manual y el vigía no lo relanza.

`scripts/watchdog.js`, que ejecuta `watchdog.yml`, lee `/api/status`, comprueba las páginas y abre una incidencia de GitHub o envía correo con Resend.

**Despliegue**: `deploy.yml` ejecuta `npx wrangler deploy` y luego `node scripts/smoke.js --base https://perdata.site`.

## 3. Catálogo de incidentes

Cada código tiene su detección, ejemplos reales, comprobación a mano y directiva. Los ejemplos son mensajes copiados de los logs de GitHub Actions.

### SMV_BLOQUEO

- **Detección**: fallo de `smv.yml` o `smv-precios.yml` con «HTTP 418», «HTTP 403», «fetch failed» o «respuesta inesperada de la SMV» en el log.
- **Síntomas**: el 20-nov-2026, 08:51 UTC, «Cotizaciones de Lima (SMV)» (run 44704396184) terminó con `SMV: 0/221 valores consultados, 0 filas guardadas · fallos: INTEGRC1 (SMV HTTP 418), AIPC1 (SMV HTTP 418), ...`. Ese mismo día fallaron varias ejecuciones de «Hechos de importancia (SMV)» (08:31, 08:43 y 14:25 UTC).
- **Comprobar a mano**:
  ```bash
  gh run list -R Wagustin/macro-data-explorer --workflow smv-precios.yml --limit 3 --json status,conclusion,createdAt
  gh run view <run-id> -R Wagustin/macro-data-explorer --json jobs -q '.jobs[] | "\(.databaseId) \(.name) \(.conclusion)"'
  gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | grep -E "HTTP 418|HTTP 403|fetch failed|respuesta inesperada"
  curl -s https://perdata.site/api/status | jq '.smv.ageHours'
  ```
- **Directiva**: ESPERAR 2 h y RELANZAR (máx. 2/día). Si `/api/status` marca `smv` con `ageHours` > 72, AVISAR. El plan B (descargar desde el servidor) lo hace Claude, no el vigía: ver sección 6.

### CHOQUE_PUSH

- **Detección**: fallo en un paso «Guardar…» con «CONFLICT», «rejected», «non-fast-forward» o «could not apply».
- **Síntomas**: el 19-nov-2026, 20:39 UTC, «Noticias financieras (Feeds autorizados)» (run 44610150986, job 135864363559) registró `CONFLICT (content): Merge conflict in data/noticias.json` (también en `data/noticias-clasificadas.json`, `data/noticias-resumen.json` y `data/resumenes/2026-11-19.json`) y `error: could not apply d34dad3... data(news): feeds y clasificaciones actualizados 2026-11-19 20:39 UTC`.
- **Comprobar a mano**:
  ```bash
  gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | grep -E "CONFLICT|rejected|non-fast-forward|could not apply"
  curl -s https://perdata.site/api/status | jq '.news.ageHours'
  ```
- **Directiva**: RELANZAR una vez si los datos de ese workflow siguen viejos en `/api/status`; si no, ignorar (otra ejecución ya publicó).

### RED_PASAJERA

- **Detección**: fallo con «ECONNRESET», «ETIMEDOUT», «socket hang up», «502», «503», «504», «rate limit» o «fetch failed», fuera de SMV.
- **Síntomas**: `Error: read ECONNRESET` y `TypeError: fetch failed` en un fallo de red. El caso del 20-nov-2026, 20:42 UTC (run 44813708750, smoke del watchdog) tiene ese mensaje, pero por su paso cae en WATCHDOG_SMOKE (ver nota de desempate más abajo).
- **Comprobar a mano**:
  ```bash
  gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | grep -E "ECONNRESET|ETIMEDOUT|socket hang up|502|503|504|rate limit|fetch failed"
  ```
- **Directiva**: RELANZAR una vez tras 30 min. Si vuelve a fallar con lo mismo, ESPERAR; al tercer fallo del día, AVISAR.

> **Nota de desempate**: un fallo en el paso «Comprobar la web y los procesos diarios» de `watchdog.yml` es WATCHDOG_SMOKE aunque el mensaje sea de red. RED_PASAJERA aplica a los workflows de datos.

### WATCHDOG_SMOKE

- **Detección**: `watchdog.yml` falla en el paso «Comprobar la web y los procesos diarios» (el catálogo lo nombra «Comprobar la web…»).
- **Síntomas**: el 20-nov-2026, 20:42 UTC (run 44813708750): `FALLA Pruebas completas (smoke): Command failed: node scripts/smoke.js --base https://perdata.site` y `Error fatal en smoke test: TypeError: fetch failed` con `[cause]: Error: read ECONNRESET`.
- **Comprobar a mano**:
  ```bash
  gh run list -R Wagustin/macro-data-explorer --workflow watchdog.yml --limit 4 --json conclusion,createdAt
  npm run smoke:prod
  ```
- **Directiva**: si la siguiente ejecución del watchdog pasa, ignorar. Si fallan 2 seguidas, DESPLEGAR. Si tras desplegar fallan 2 más, VOLVER_ATRAS y AVISAR.

### BOLETIN_NO_SALIO

- **Detección**: lunes a sábado, después de las 09:00 de Lima, no hay commit «data(boletin): enviado `<hoy Lima>`» en `origin/main`.
- **Síntomas**: no sale el boletín de la mañana; `data/boletin-last.json` no tiene la fecha de hoy.
- **Comprobar a mano**:
  ```bash
  gh api "repos/Wagustin/macro-data-explorer/commits?sha=main&per_page=40" --jq '.[].commit.message' | grep -F "data(boletin): enviado $(TZ=America/Lima date +%F)"
  curl -s https://raw.githubusercontent.com/Wagustin/macro-data-explorer/main/data/boletin-last.json
  ```
  El commit usa la fecha UTC (`date -u +%F`). La comprobación vale de lunes a sábado entre las 09:00 y las 19:00 de Lima, cuando la fecha UTC coincide con la de Lima.
- **Directiva**: RELANZAR `boletin.yml` (es seguro: el script solo envía una vez al día). Si a las 11:00 sigue sin salir, AVISAR.

### DATO_VIEJO

- **Detección**: en `/api/status`, algún bloque con `ageHours` > `staleAfterHours`, o `backup.fecha` distinta de hoy (UTC) después de las 12:00 UTC.
- **Síntomas**: un bloque del portal (dólar, noticias, cotizaciones, datos oficiales) muestra una fecha antigua.
- **Comprobar a mano**:
  ```bash
  curl -s https://perdata.site/api/status | jq 'map_values({ageHours, staleAfterHours, error, fecha, edadHoras})'
  date -u +%F
  ```
- **Relación bloque → workflow**: `forecasts` → `timesfm.yml`; `news` → `news.yml`; `smv` → `smv-precios.yml`; `bcrp` y `eia` → `official-data.yml`; `d1Sync` → `d1-backfill.yml`.
- **Directiva**: RELANZAR el workflow dueño. Si sigue viejo 6 h después, AVISAR. Backup viejo (`backup.fecha`): solo AVISAR, porque la copia diaria la hace el Worker (`runBackup`) y relanzar `backup.yml` no la arregla.

### PAGINA_CAIDA

- **Detección**: `/`, `/dolar`, `/precios` o `/boletin` no responden 200 en dos intentos con 1 min de diferencia.
- **Comprobar a mano**:
  ```bash
  for p in / /dolar /precios /boletin; do echo "$p $(curl -s -o /dev/null -w '%{http_code}' https://perdata.site$p)"; done
  ```
  Repetir una vez tras 1 min.
- **Directiva**: si es la primera vez, ESPERAR. Si sigue en la siguiente pasada, DESPLEGAR. Si tras desplegar sigue, VOLVER_ATRAS y AVISAR.

### PAGOS_ABIERTOS

- **Detección**: `/api/billing?action=config` devuelve `paymentsEnabled` distinto de `false` mientras dure la pausa.
- **Comprobar a mano**:
  ```bash
  curl -s "https://perdata.site/api/billing?action=config" | jq .paymentsEnabled
  ```
  La pausa está en `wrangler.jsonc` (`"PAYMENTS_ENABLED": "0"`); `api/billing.js` solo activa los pagos si la variable vale `"1"`.
- **Directiva**: solo AVISAR, de inmediato. Nunca tocar la variable ni el código de pagos.

### CI_ROJO

- **Detección**: `ci.yml` falla en `main`.
- **Comprobar a mano**:
  ```bash
  gh run list -R Wagustin/macro-data-explorer --workflow ci.yml --branch main --limit 3 --json conclusion,createdAt,databaseId
  ```
- **Directiva**: solo AVISAR (es un cambio de código: lo arregla Claude). No desplegar mientras CI esté en rojo. `ci.yml` no tiene `workflow_dispatch`, así que no se puede relanzar.

### DESCONOCIDO

- **Detección**: cualquier fallo que no encaje en los códigos anteriores.
- **Clasificación**: el clasificador (Nemotron) vive en el vigía, fuera de este repo. Intenta encajar el fallo en uno de los códigos de este catálogo.
- **Comprobar a mano**: leer el final del log del job:
  ```bash
  gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | tail -n 100
  ```
- **Directiva**: si no está seguro, AVISAR con el final del log.

## 4. Comandos útiles

- **Fallos de las últimas 24 h**:
  ```bash
  gh run list -R Wagustin/macro-data-explorer --status failure --limit 50 --json databaseId,workflowName,createdAt -q '.[] | select(.createdAt > "'"$(date -u -d '24 hours ago' +%FT%TZ)"'") | "\(.createdAt) \(.workflowName) run \(.databaseId)"'
  ```
- **Jobs de un run y su log**:
  ```bash
  gh run view <run-id> -R Wagustin/macro-data-explorer --json jobs -q '.jobs[] | "\(.databaseId) \(.name) \(.conclusion)"'
  gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs
  ```
  Con `gh run view --log-failed` a veces sale vacío en runs antiguos; el endpoint de jobs funciona siempre.
- **Relanzar un workflow** (comprobar antes que no haya uno en curso):
  ```bash
  gh run list -R Wagustin/macro-data-explorer --workflow <archivo> --limit 1 --json status,createdAt
  gh workflow run <archivo> -R Wagustin/macro-data-explorer
  ```
- **Desplegar** (origin/main, con CI verde):
  ```bash
  gh workflow run deploy.yml -R Wagustin/macro-data-explorer
  gh run list -R Wagustin/macro-data-explorer --workflow deploy.yml --limit 1
  ```
- **Volver atrás**: listar las versiones y volver a la anterior. Wrangler no está en `devDependencies`; `npx` lo descarga y necesita las credenciales de Cloudflare del servidor.
  ```bash
  npx wrangler deployments list
  npx wrangler rollback [version-id]
  ```
- **Comprobar producción**:
  ```bash
  curl -s https://perdata.site/api/status | jq
  curl -s "https://perdata.site/api/billing?action=config" | jq .paymentsEnabled
  for p in / /dolar /precios /boletin; do echo "$p $(curl -s -o /dev/null -w '%{http_code}' https://perdata.site$p)"; done
  npm run smoke:prod
  npm run deploy:check
  ```

## 5. Qué NO se hace nunca sin Claude o Agustín

- Cambiar código (también workflows y scripts), diseño o estilos.
- Cambiar textos de la web, de los correos o del boletín.
- Cambiar variables, incluido `PAYMENTS_ENABLED` (en `wrangler.jsonc` y en los secretos de GitHub y Cloudflare).
- Tocar DNS, cuentas (GitHub, Cloudflare, Supabase, Stripe, Resend) o claves.
- Borrar datos o editarlos a mano (Supabase, D1, copias de seguridad, `data/*.json`).
- Hacer push directo a `main` o desplegar fuera de los límites del vigía.

## 6. Plan B de la SMV

Es una acción manual de Claude, no del vigía. Se usa cuando la SMV bloquea a GitHub (SMV_BLOQUEO con `smv.ageHours` > 72) o cuando Agustín lo pide.

1. Comprobar que el bloqueo sigue: último log de `smv-precios.yml` y `curl -s https://perdata.site/api/status | jq .smv`.
2. En el servidor, desde el clon `~/macro-data-explorer` (tiene el `.env`; el worktree solo tiene `.env.example`), con Node 22 como en el workflow:
   ```bash
   node --env-file=.env scripts/fetch-smv-precios.js
   ```
   Necesita `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SYNC_SECRET` y `APP_URL` en el `.env`. Con unos 221 valores y una petición cada 3 s, tarda unos 11 minutos.
3. Recalcular lo que recalcula `smv-precios.yml` después de la descarga: `node scripts/build-empresas-estado.js`, `node scripts/engine-acciones.js` y `node scripts/build-empresas-html.js`.
4. Si cambian `data/empresas-estado.json`, `empresas.html`, `empresa/` o `data/acciones-rangos.json`, los confirma Claude. El vigía no hace commits.
5. Verificar con `curl -s https://perdata.site/api/status | jq .smv.ageHours`.
