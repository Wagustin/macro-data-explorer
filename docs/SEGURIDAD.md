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

- Las páginas estáticas generan `Content-Security-Policy-Report-Only` por ruta. `script-src` contiene hashes SHA-256 de cada script en línea y `'strict-dynamic'`, con `https:` como respaldo para navegadores que no aplican `'strict-dynamic'`.
- **Pendiente antes de aplicar enforcement:** la prueba local con enforcement de `'strict-dynamic'` impidió que se montara el control de inicio de sesión (el botón de Google dejó de aparecer). Se conserva Report-Only hasta adaptar la carga de scripts externos insertados por el parser y repetir el flujo completo.
- `/api/internal/sync` requiere el bearer `SYNC_SECRET` antes de acceder a D1 y aplica límite por IP después de autenticar. El webhook de Stripe valida su firma antes de analizar el evento y no aplica límite por IP.
- Las acciones de billing aplican límite por IP y requieren sesión; la lectura pública de configuración no requiere sesión.
