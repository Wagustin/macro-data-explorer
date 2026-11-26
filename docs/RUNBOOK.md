# Runbook de incidentes de PerData

Este manual sirve a dos lectores: las personas que atienden un incidente y el vigía automático. El catálogo de códigos, acciones y límites es la fuente única (`handoff/vigia-catalogo.md`, fuera de este repo). Si este documento y el catálogo discrepan, manda el catálogo.

Repositorio: `Wagustin/macro-data-explorer` (rama `main`). Web en https://perdata.site, servida por el Worker `perdata-cf` (`wrangler.jsonc`).

## 1. Propósito y regla de oro

Este runbook describe cómo se detectan, comprueban y resuelven los incidentes de PerData: datos que no se actualizan, workflows de GitHub Actions que fallan, páginas caídas o pagos abiertos por error. Define qué puede hacer el vigía automático y qué queda reservado a Claude o a Agustín.

Regla de oro (del catálogo):

> El vigía NUNCA cambia código, diseño, textos, datos a mano, variables, DNS ni cuentas. Solo usa estas acciones: RELANZAR, ESPERAR, DESPLEGAR, VOLVER_ATRAS, REPARAR y AVISAR.

Acciones permitidas:

- **RELANZAR `<workflow.yml>`**: `gh workflow run <archivo> -R Wagustin/macro-data-explorer`.
- **ESPERAR**: no hacer nada en esta pasada y volver a mirar en la siguiente (cada 30 min).
- **DESPLEGAR**: `gh workflow run deploy.yml` (despliega origin/main, que ya pasó CI) y comprobar el smoke en la siguiente pasada.
- **VOLVER_ATRAS**: `gh workflow run rollback.yml -f motivo=<código>`, que ejecuta `npx wrangler rollback` a la versión anterior del Worker dentro de GitHub Actions. Solo si el smoke de producción falla dos pasadas seguidas DESPUÉS de un DESPLEGAR.
- **REPARAR**: `gh workflow run reparar.yml -R Wagustin/macro-data-explorer -f codigo=<código> -f workflow=<archivo> -f run_id=<id>`. Pide a un modelo un parche mínimo con barreras y tests; si tiene éxito, el propio `reparar.yml` relanza el workflow afectado (el vigía no lo relanza). Se usa con CI_ROJO (además de AVISAR) y con ERROR_CODIGO (además de AVISAR).
- **AVISAR**: Telegram a Agustín con el diagnóstico, la acción y la línea «Qué hacer a mano:» (y nada más); si Telegram no está configurado o falla, correo con Resend. De 23:00 a 07:00 (hora de Lima) solo salen de noche los críticos; ver «Horas de silencio y resumen diario» en la sección 3.

Límites: como mucho 2 RELANZAR por workflow y día; 1 DESPLEGAR y 1 VOLVER_ATRAS por día; REPARAR, como mucho 1 por workflow y día y 2 al día en total, y nunca con `reparar.yml` en curso. Un gh que falla (red, rate limit, timeout) no gasta ningún límite. Al pasar el límite, AVISAR. Nunca actuar si el mismo workflow está en curso (status `in_progress` o `queued`).

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

**Despliegue**: `deploy.yml` ejecuta `npx wrangler deploy` y luego `node scripts/smoke.js --base https://perdata.site`. `rollback.yml` (manual, o disparado por el vigía con `-f motivo=<código>`) ejecuta `npx wrangler rollback --yes`, espera 20 s y pasa el mismo smoke. Comparte el grupo de concurrencia `deploy`.

## 3. Catálogo de incidentes

Cada código tiene su detección, ejemplos reales, comprobación a mano y directiva. Los ejemplos son mensajes copiados de los logs de GitHub Actions.

### SMV_BLOQUEO

- **Detección**: fallo de `smv.yml` o `smv-precios.yml` con «HTTP 418», «HTTP 403», «fetch failed» o «respuesta inesperada de la SMV» en el log. Solo ese patrón da SMV_BLOQUEO: Nemotron nunca lo asigna por sí solo (si lo propone sin el patrón, el fallo es DESCONOCIDO). Un «HTTP 404» o «HTTP 410» de la SMV es FUENTE_CAMBIO (abajo), no SMV_BLOQUEO.
- **Síntomas**: el 20-nov-2026, 08:51 UTC, «Cotizaciones de Lima (SMV)» (run 44704396184) terminó con `SMV: 0/221 valores consultados, 0 filas guardadas · fallos: INTEGRC1 (SMV HTTP 418), AIPC1 (SMV HTTP 418), ...`. Ese mismo día fallaron varias ejecuciones de «Hechos de importancia (SMV)» (08:31, 08:43 y 14:25 UTC).
- **Comprobar a mano**:
  ```bash
  gh run list -R Wagustin/macro-data-explorer --workflow smv-precios.yml --limit 3 --json status,conclusion,createdAt
  gh run view <run-id> -R Wagustin/macro-data-explorer --json jobs -q '.jobs[] | "\(.databaseId) \(.name) \(.conclusion)"'
  gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | grep -E "HTTP 418|HTTP 403|fetch failed|respuesta inesperada"
  curl -s https://perdata.site/api/status | jq '.smv.ageHours'
  ```
- **Directiva**: si el origen es `smv.yml` o `smv-precios.yml` (log del propio workflow): ESPERAR 2 h y RELANZAR (máx. 2/día). Si `/api/status` marca `smv` con `ageHours` > 72, AVISAR.
- **Origen watchdog** (`FALLA  Hechos de importancia (SMV): última lectura hace 34 h`): ESPERAR, no relanzar. AVISAR solo si el dato pasa de 48 h (hechos) o de 72 h (cotizaciones).
- **Lectura directa de hechos**: en cada pasada el vigía lee `data/smv-hechos.json` (campo raíz `actualizado`) y avisa si tiene más de 48 h, aunque el watchdog no corra. Si el watchdog ya avisa de hechos por encima de 48 h, no se duplica.
- **Regla de 72 h de cotizaciones**: el aviso por `/api/status` (`smv.ageHours` > 72) solo se evalúa cuando hay un SMV_BLOQUEO (fallo de `smv-precios.yml` o FALLA del watchdog). No hay un aviso por edad de cotizaciones sin fallo; si la edad se disparara sin fallo, lo cubre DATO_VIEJO (límite del bloque `smv`).
- El plan B (descargar desde el servidor) ya es automático para cotizaciones (`scripts/smv-plan-b.sh`) y hechos de importancia (`scripts/smv-plan-b-hechos.sh`): ver sección 6. El vigía no lo ejecuta.

### FUENTE_CAMBIO

- **Detección**: fallo de un workflow de datos (`timesfm`, `news`, `smv`, `smv-precios`, `official-data`, `cierre-ayer`, `cierre-tarde`, `boletin`, `alertas`, `d1-backfill`) cuyo log trae «HTTP 404» o «HTTP 410» en una línea que nombra una fuente externa (SMV, BCRP, SUNAT, EIA) o una URL que no es `perdata.site` ni `api.github.com`.
- **Ejemplo**: `Error: SMV HTTP 404 en https://www.smv.gob.pe/... (scripts/fetch-smv.js)`. El aviso dice qué fuente, qué URL y qué script aparecen en el log.
- **Qué significa**: la fuente ha cambiado su URL o ha dejado de existir. Relanzar no lo arregla.
- **Comprobar a mano**:
  ```bash
  gh run view <run-id> -R Wagustin/macro-data-explorer --log-failed | grep -E 'HTTP (404|410)'
  ```
  Abrir la URL de la fuente en el navegador y revisar el script que la llama.
- **Directiva**: solo AVISAR, sin RELANZAR. La corrección de la URL la hace Claude o Agustín.

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
- **Síntomas**: `Error: read ECONNRESET` y `TypeError: fetch failed` en un fallo de red. El caso del 20-nov-2026, 20:42 UTC (run 44813708750, smoke del watchdog) tiene ese mensaje, pero es WATCHDOG_SMOKE (ver precedencia más abajo).
- **Comprobar a mano**:
  ```bash
  gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | grep -E "ECONNRESET|ETIMEDOUT|socket hang up|502|503|504|rate limit|fetch failed"
  ```
- **Directiva**: RELANZAR una vez tras 30 min. Si vuelve a fallar con lo mismo, ESPERAR; al tercer fallo del día, AVISAR.

> **Precedencia**: si el log del watchdog trae «FALLA  Pruebas completas (smoke)» o «Error fatal en smoke test», es WATCHDOG_SMOKE aunque también falle un proceso o el log diga ECONNRESET. Si no, cada «FALLA  <proceso>» se clasifica por el proceso (SMV_BLOQUEO o DATO_VIEJO, ver abajo). RED_PASAJERA aplica a los workflows de datos.

### WATCHDOG_SMOKE

- **Detección**: `watchdog.yml` falla en el paso «Comprobar la web y los procesos diarios» y el log trae `FALLA  Pruebas completas (smoke)` o `Error fatal en smoke test`. Solo cuando falla el smoke; si falla un proceso, se clasifica por el proceso.
- **No es WATCHDOG_SMOKE**: `FALLA  Hechos de importancia (SMV): última lectura hace 34 h` con `OK     Pruebas completas (smoke): TOTAL: 165 pruebas | 165 OK | 0 FAIL`. Eso es SMV_BLOQUEO (ver arriba) y nunca DESPLEGAR.
- **Síntomas**: el 20-nov-2026, 20:42 UTC (run 44813708750): `FALLA Pruebas completas (smoke): Command failed: node scripts/smoke.js --base https://perdata.site` y `Error fatal en smoke test: TypeError: fetch failed` con `[cause]: Error: read ECONNRESET`.
- **Comprobar a mano**:
  ```bash
  gh run list -R Wagustin/macro-data-explorer --workflow watchdog.yml --limit 4 --json conclusion,createdAt
  npm run smoke:prod
  ```
- **Directiva**: si la siguiente ejecución del watchdog pasa, ignorar. Si fallan 2 seguidas, DESPLEGAR; si todos esos fallos son de red (ECONNRESET, 502-504, rate limit, fetch failed), hacen falta 3. Si tras desplegar fallan 2 más, VOLVER_ATRAS y AVISAR.

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
- **Procesos del watchdog** (`FALLA  <proceso>: … hace N h`): «Proyecciones diarias» y «Motor» → `timesfm.yml`; «Noticias» y «Resumen de noticias (IA)» → `news.yml`; «Datos oficiales» → `official-data.yml`; «Hechos de importancia (SMV)» → `smv.yml` (SMV_BLOQUEO, ver arriba). «Copia de seguridad», «Boletín» y el resto no tienen dueño: solo AVISAR.
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
- **Directiva**: AVISAR y REPARAR `ci.yml` (una vez al día, con el límite de REPARAR). No desplegar mientras CI esté en rojo. `ci.yml` no tiene `workflow_dispatch`, así que no se puede relanzar: el parche lo pide `reparar.yml`.

### ERROR_CODIGO

- **Detección**: fallo de un workflow de datos (timesfm, news, smv, smv-precios, official-data, cierre-ayer, cierre-tarde, boletin, alertas, d1-backfill) cuyo log trae `TypeError`, `ReferenceError`, `SyntaxError`, `is not a function`, `Cannot read properties`, `Unexpected token` o un stack trace con una ruta del repo. No es red, SMV, choque de push ni rate limit (esos códigos tienen prioridad).
- **Directiva**: AVISAR y REPARAR el workflow (una vez por workflow y día). El vigía no toca código.
- **Comprobar a mano**: `gh run view <run_id> -R Wagustin/macro-data-explorer --log-failed | tail -n 60`

### DESCONOCIDO

- **Detección**: cualquier fallo que no encaje en los códigos anteriores.
- **Clasificación**: el clasificador (Nemotron) vive en el vigía, fuera de este repo. Intenta encajar el fallo en uno de los códigos de este catálogo.
- **Comprobar a mano**: leer el final del log del job:
  ```bash
  gh api repos/Wagustin/macro-data-explorer/actions/jobs/<job-id>/logs | tail -n 100
  ```
- **Directiva**: si no está seguro, AVISAR con el final del log.

### SIN_LATIDO

- **Detección**: `/api/status` no responde, o el último run de cualquier workflow de datos (`timesfm`, `noticias-dia`, `news`, `smv`, `smv-precios`, `official-data`, `cierre-ayer`, `cierre-tarde`, `boletin`, `alertas`, `d1-backfill`, `watchdog`) es de hace más de 4 h. El watchdog corre cada hora, así que sin él de noche `news` podría parecer parado por retrasos de GitHub.
- **Qué significa**: el servidor de casa, que dispara parte de los relanzamientos (`scripts/dispatch-backup.sh`), no está corriendo, o el Worker no responde. Los workflows de GitHub con cron siguen su curso, así que el aviso también llega cuando solo se ha caído `/api/status`.
- **Comprobar a mano**:
  ```bash
  gh run list -R Wagustin/macro-data-explorer --limit 20 --json workflowName,createdAt,status,conclusion
  curl -s -o /dev/null -w '%{http_code}\n' https://perdata.site/api/status
  ```
- **Directiva**: solo AVISAR. El vigía no relanza nada por esta causa; lo mira Claude o Agustín.

### SERVIDOR_CASA

- **Detección**: el vigía no ve el servidor de casa (`wagus-server`, Tailscale 100.120.75.115). El par no aparece en línea en `tailscale status --json` y el puerto 22 no responde a una conexión TCP de 5 s. Dos pasadas seguidas (unos 30 min) sin respuesta. Si `tailscale` no está instalado, cuenta solo el TCP.
- **Síntomas**: los planes B de la SMV (`scripts/smv-plan-b.sh` y `scripts/smv-plan-b-hechos.sh`) no corren; cotizaciones y hechos se quedan viejos.
- **Comprobar a mano**:
  ```bash
  tailscale status | grep wagus-server
  timeout 5 bash -c '</dev/tcp/100.120.75.115/22' && echo "puerto 22 abierto"
  ```
- **Directiva**: solo AVISAR, sin relanzar nada. Hay un aviso de recuperación cuando el servidor vuelve a responder.

### VIGIA_ROTO

- **Detección**: cualquier acción de `gh` responde 401, «Bad credentials», o 403 con «Resource not accessible», «must have admin rights» o «permission» (token de GitHub caducado o sin permisos; un 403 por límite de peticiones —«rate limit», «secondary rate»— no cuenta); la API de NVIDIA responde 401; o Telegram falla dos envíos seguidos. Si una escritura (relanzar, desplegar, reparar, rollback) es rechazada por permisos, el vigía no la reintenta en 6 h.
- **Síntomas**: el vigía deja de ver los runs (todas las fuentes de GitHub fallan), no clasifica los fallos DESCONOCIDOS, o no llegan avisos por Telegram.
- **Comprobar a mano**:
  ```bash
  cd ~/perdata-vigia && set -a && . ./env && set +a && gh api user --jq .login
  cd ~/perdata-vigia && node vigia.mjs --seco ; tail -n 5 ~/.local/state/perdata-vigia.log
  ```
- **Permisos de GitHub**: en GitHub, Settings → Developer settings → Fine-grained tokens, editar el token del vigía y poner **Actions: Read and write** (el token es solo de `Wagustin/macro-data-explorer`). Si el token ha caducado, renovar `GH_TOKEN` en `~/perdata-vigia/env`.
- **Directiva**: VIGIA_ROTO es crítico: sale también de noche, como mucho un aviso cada 6 h. Renovar lo que indique el aviso en `~/perdata-vigia/env` (`GH_TOKEN`, `VIGIA_NVIDIA_API_KEY`, `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`). El vigía no cambia credenciales.

### Horas de silencio y resumen diario

- **Horas de silencio (23:00 a 07:00 de Lima)**: de noche solo salen por Telegram los avisos críticos: PAGOS_ABIERTOS, PAGINA_CAIDA, SIN_LATIDO, VIGIA_ROTO y una VOLVER_ATRAS ya ejecutada. El resto se acumula (una entrada por código) y va en el resumen de las 08:00. Las acciones (relanzar, esperar) se hacen de noche igual.
- **Resuelto**: cuando un incidente por el que el vigía avisó o actuó desaparece, sale un único mensaje «Resuelto: <código> en <workflow o recurso> — <cómo se resolvió>, duró <duración>». El fin se detecta así: un fallo de workflow, con el siguiente run completo del mismo workflow en éxito; un dato viejo, con el dato de nuevo en plazo; una página, con 200; pagos, con `paymentsEnabled` en false. «Cómo» es «relanzado por el vigía», «desplegado», «reparador» o «se resolvió solo». De noche va al resumen de las 08:00, salvo que el incidente fuera crítico. El servidor de casa no tiene «Resuelto»: su aviso de recuperación ya cierra ese caso.
- **Resumen diario (08:00 de Lima, una vez al día)**: sale por Telegram también en modo seco, marcado «[modo prueba]». Contiene: pasadas del día, incidentes del día por código, acciones que el vigía haría (en seco, de la memoria simulada) o ha hecho (en real), avisos acumulados en silencio, estado de `/api/status` y pagos en pausa. Así se revisa cada mañana si el vigía decide bien.
- **Lectura del log en seco**: cada pasada escribe una línea y, debajo, una línea «  · <código>@<origen>: <acción> — <motivo> (regla: ...)» por incidente, con el resultado al final (`simulado (seco)`, `en silencio`, `suprimido`, `enviado por telegram`...).

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
- **Volver atrás**: el workflow `rollback.yml` vuelve a la versión anterior del Worker y pasa el smoke. Las credenciales de Cloudflare solo están en los secretos de GitHub; el servidor del vigía no las tiene.
  ```bash
  gh workflow run rollback.yml -R Wagustin/macro-data-explorer -f motivo="motivo breve"
  gh run list -R Wagustin/macro-data-explorer --workflow rollback.yml --limit 1
  ```
  Para elegir una versión concreta hay que hacerlo con Wrangler en un equipo con las credenciales de Cloudflare (`npx wrangler deployments list` y `npx wrangler rollback <version-id>`).
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

Ahora es automático. El cron del servidor ejecuta `scripts/smv-plan-b.sh` a las 02:40 UTC de martes a sábado (21:40 de Lima). El script:

1. Actualiza el clon `~/macro-data-explorer` (`git pull --ff-only`).
2. Si hay un run de «Cotizaciones de Lima (SMV)» con éxito en las últimas 20 h, o uno en curso, sale sin hacer nada.
3. Si no, descarga las cotizaciones desde el servidor (`scripts/fetch-smv-precios.js`, con el `.env` del clon; unos 11 minutos). Si guarda filas, lanza `smv-precios.yml` con `saltar_descarga=1`, que recalcula y publica sin volver a bajar de la SMV. Si el `.env` no tiene `SYNC_SECRET`, lanza también `d1-backfill.yml`.
4. Anota una línea por ejecución en `~/.local/state/smv-plan-b.log` (fecha UTC, decisión y filas).

Para lanzarlo a mano desde el worktree o desde el clon:
```bash
bash scripts/smv-plan-b.sh
```
Variables útiles: `PLANB_SECO=1` no lanza ningún workflow; `PLANB_FORZAR=1` salta el chequeo de runs recientes.

Si hace falta recalcular a mano (por ejemplo, si el workflow falla tras la descarga), el orden es el de `smv-precios.yml`: `node scripts/build-empresas-estado.js`, `node scripts/engine-acciones.js` y `node scripts/build-empresas-html.js`. Los cambios en `data/empresas-estado.json`, `empresas.html`, `empresa/` o `data/acciones-rangos.json` los confirma Claude; el vigía no hace commits.

Hechos de importancia (`smv.yml`): mismo problema con el HTTP 418. `scripts/smv-plan-b-hechos.sh` descarga `scripts/fetch-smv.js` en el worktree propio `~/kathy_workspace/wt-planb-data` (se crea la primera vez; en cada ejecución queda igual que `origin/main`) y, si `actualizado` de `data/smv-hechos.json` cambia, hace commit como `perdata-bot` y push a `main`. Si `actualizado` tiene menos de 20 h, sale sin hacer nada. Usa su propio lock (`~/.local/state/smv-plan-b-hechos.lock`) y escribe en el mismo log con prefijo `hechos:`. Variables: `PLANB_SECO=1` descarga pero no hace commit ni push; `PLANB_FORZAR=1` salta el chequeo de 20 h; `DATA_WT` cambia la ruta del worktree.

Para lanzarlo a mano:
```bash
bash scripts/smv-plan-b-hechos.sh
```
Cron propuesto (no instalado; el crontab se cambia a mano): `20 6,14 * * * /home/wagustin/macro-data-explorer/scripts/smv-plan-b-hechos.sh >/dev/null 2>&1`

Verificar con `curl -s https://perdata.site/api/status | jq .smv.ageHours`.

Si el servidor de casa no responde, estos planes B no corren: ver SERVIDOR_CASA (sección 3). El vigía lo avisa tras dos pasadas seguidas.
