# El vigía

Script que se ejecuta por cron en el servidor cada 30 minutos (`scripts/vigia.mjs`). Mira el sitio
(perdata.site), los runs de GitHub Actions de las últimas 24 h y el commit del boletín; clasifica los
incidentes con el catálogo (`handoff/vigia-catalogo.md`) y aplica solo las acciones de ese catálogo:
RELANZAR un workflow, DESPLEGAR, VOLVER_ATRAS o AVISAR por correo. Nunca edita archivos del repo, no
hace commits y no toca variables, DNS ni cuentas. Nemotron (NVIDIA NIM) solo devuelve un código para
los fallos que las reglas no reconocen; nunca decide acciones.

## Instalar en cron

Añadir a la crontab del usuario (no se instala automáticamente):

```
*/30 * * * * cd /home/wagustin/macro-data-explorer && /usr/bin/env node scripts/vigia.mjs >> ~/.local/state/perdata-vigia.cron.log 2>&1
```

Nota: el cron de arriba ejecuta el script del repo principal. Mientras el vigía viva en la rama
`vigia`, usar la ruta del worktree o hacer merge antes de instalarlo.

## Variables

| Variable | Dónde | Para qué |
|---|---|---|
| `VIGIA_ACTUAR` | entorno o `.env` del repo | `1` activa las acciones reales. Cualquier otro valor (o nada) = modo seco. |
| `VIGIA_EMAIL` | entorno o `.env` del repo | Destinatario de los avisos. Sin él, los avisos solo se escriben en el log. |
| `VIGIA_MODELO` | entorno | Id exacto del modelo Nemotron. Si no existe, el vigía elige un Nemotron pequeño (lightning/nano) de `GET /v1/models`. |
| `VIGIA_NVIDIA_API_KEY` | entorno o `~/.config/perdata-vigia/env` (permisos 600) | Clave propia del vigía para NVIDIA NIM. No usa la `NVIDIA_API_KEY` del repo. |
| `RESEND_API_KEY`, `EMAIL_FROM` | `.env` del repo | Envío de correos por Resend. |

Nunca se imprimen claves en logs ni en correos; los textos enviados pasan por un filtro de redacción.

## Modo seco y modo real

El modo seco es el por defecto: hace todo (lee estado, clasifica, decide) salvo ejecutar acciones y
enviar correos. Solo escribe en el log lo que haría (`[seco] RELANZAR ...`).

Para pasar a modo real, tras revisar una semana de logs en seco:

1. Definir `VIGIA_ACTUAR=1` y `VIGIA_EMAIL=<correo>` en el entorno de cron o en el `.env` del repo.
2. Comprobar la siguiente pasada en el log.

Para volver a modo seco, quitar `VIGIA_ACTUAR` o ponerlo distinto de `1`.

## Parar el vigía

Quitar la línea de la crontab. Si una pasada está en marcha, termina sola; el lock
`~/.local/state/perdata-vigia.lock` evita pasadas solapadas y se libera al terminar.

## Archivos de estado

- `~/.local/state/perdata-vigia.json`: contadores del día, avisos recientes, despliegues e incidentes en seguimiento.
- `~/.local/state/perdata-vigia.log`: una línea por pasada (hora, modo, incidentes, acciones).
- `~/.local/state/perdata-vigia.cron.log`: salida de cron.

## Pruebas

```
npm test                       # incluye test/vigia.test.js (sin red)
node scripts/vigia.mjs --seco  # una pasada en seco contra GitHub y perdata.site
```
