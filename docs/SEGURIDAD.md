# Seguridad

## Secretos

Este inventario enumera nombres y ubicaciones, nunca valores.

| Secretos por nombre | Ubicación |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY`, `STRIPE_PRICE_ID_BOLETIN_MONTHLY`, `STRIPE_PRICE_ID_BOLETIN_YEARLY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TRIAL_DAYS`, `STRIPE_PORTAL_CONFIG_ID`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `SYNC_SECRET`, `BACKUP_KEY`, `GH_DISPATCH_TOKEN` | Variables/secretos del Worker, configurados fuera del repositorio |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SYNC_SECRET`, `BACKUP_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `NVIDIA_API_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `ALERT_EMAIL` | GitHub Actions Secrets; cada workflow recibe solo los nombres que necesita |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` y claves opcionales de tareas administrativas | Entorno del servidor local, normalmente `.env` (ignorado por Git) |

`GH_DISPATCH_TOKEN` del Worker es un token de grano fino con permiso Actions de lectura y escritura, pero puede acceder a todos los repositorios de la cuenta, no solo a `macro-data-explorer`. **Riesgo aceptado por decisión de Agustín, 28-oct-2026.** Caducidad: ver RESULTADO_SEGURIDAD.md.

### Rotación

Crear el token nuevo, escribirlo en `~/.github/perdata_worker.env` y ejecutar `~/kathy_workspace/set_gh_secret.sh`. Después, comprobar el flujo que lo consume y revocar el token anterior.

### Si se filtra un secreto

Rotarlo de inmediato, revocar el valor anterior y revisar los logs y ejecuciones recientes para identificar uso no autorizado. Nunca imprimir secretos en terminales, logs, informes, capturas ni commits.

## Controles verificados

- La CSP se aplica (no solo se informa) desde el 29-oct-2026. El Worker (`withScriptNonce` en worker.js) genera un nonce aleatorio por respuesta HTML, lo añade a cada `<script>` con HTMLRewriter y envía `script-src 'nonce-…' 'strict-dynamic' https: 'unsafe-inline'` (los dos últimos solo los usan navegadores antiguos). Así Google, AdSense, Stripe y Cloudflare Insights quedan autorizados por el script que los carga, sin listar dominios.
- No se usan manejadores en línea (`onload=`, `onclick=`): con la CSP aplicada quedarían bloqueados. Si hace falta, se usa un `<script>` normal, que recibe el nonce.
- No hay bloques de CSP en `public/_headers`: dos reglas que coincidían con /noticias llegaban como un solo valor separado por comas y el navegador aplicaba también la política antigua.
- Verificación antes de aplicarla: 0 violaciones en 22 páginas en Report-Only y 0 bloqueos en 12 con la política aplicada (anuncios, gráficos, botón de Google y sin errores de JavaScript).
- `/api/internal/sync` requiere el bearer `SYNC_SECRET` antes de acceder a D1 y aplica límite por IP después de autenticar. El webhook de Stripe valida su firma antes de analizar el evento y no aplica límite por IP.
- Las acciones de billing aplican límite por IP y requieren sesión; la lectura pública de configuración no requiere sesión.
