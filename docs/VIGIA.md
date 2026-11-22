# El vigía

Script que se ejecuta por cron cada 30 minutos (`scripts/vigia.mjs`). Mira el sitio (perdata.site),
los runs de GitHub Actions de las últimas 24 h, el commit del boletín, los hechos de la SMV y el servidor
de casa; clasifica los incidentes con el catálogo (`handoff/vigia-catalogo.md`, fuera de este repo) y aplica
solo las acciones de ese catálogo: RELANZAR un workflow, DESPLEGAR, VOLVER_ATRAS o AVISAR. Nunca edita
archivos del repo, no hace commits y no toca variables, DNS ni cuentas. Nemotron (NVIDIA NIM) solo devuelve
un código para los fallos que las reglas no reconocen; nunca decide acciones.

El vigía corre en una máquina de Google Cloud (Debian 13, 1 GB de RAM). Esa máquina no tiene copia
del repo ni credenciales de Cloudflare. Todo lo hace por la API de GitHub con `gh`, y el único
retroceso posible es disparar `rollback.yml` (ver RUNBOOK). El script no lee ningún archivo del repo.

## Instalar en la máquina de Google

1. Paquetes (Node 20 o superior y gh):

   ```
   sudo apt update
   sudo apt install -y nodejs gh
   node -v    # debe salir v20 o superior
   ```

   Si el `nodejs` de Debian sale por debajo de la 20, instalar Node 20 o 22 por otra vía (NodeSource o nvm)
   y usar esa ruta en el cron.

2. Carpeta y script. Desde el repo, copiar solo el script (el único archivo que hace falta):

   ```
   mkdir -p ~/perdata-vigia && chmod 700 ~/perdata-vigia
   scp scripts/vigia.mjs <usuario>@<maquina>:~/perdata-vigia/vigia.mjs
   ```

3. Archivo de entorno `~/perdata-vigia/env` con permisos 600. Formato `CLAVE=valor`, una por línea;
   se admiten comentarios (`#`), líneas vacías y valores entre comillas:

   ```
   # Clave de NVIDIA NIM (solo para clasificar fallos DESCONOCIDOS; opcional)
   VIGIA_NVIDIA_API_KEY=
   # Token fine-grained de GitHub (ver más abajo). Obligatorio si gh no tiene sesión en la máquina.
   GH_TOKEN=
   # Telegram (avisos y resumen diario). Opcionales; sin ellos, los avisos van por correo o solo al log.
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_CHAT_ID=
   # Correo con Resend (respaldo de Telegram). Opcionales.
   RESEND_API_KEY=
   EMAIL_FROM=
   VIGIA_EMAIL=
   # Modo: 1 = actuar de verdad. Cualquier otro valor (o nada) = modo seco.
   VIGIA_ACTUAR=0
   ```

   ```
   chmod 600 ~/perdata-vigia/env
   ```

   No pegar las claves en el chat, en el historial de la shell ni en un commit.

4. Token de GitHub (fine-grained), en https://github.com/settings/personal-access-tokens/new:
   - Resource owner: la cuenta de Wagustin.
   - Repository access: "Only select repositories" y solo `Wagustin/macro-data-explorer`.
   - Permisos del repositorio: Actions: Read and write; Contents: Read-only; Metadata: Read-only.
     Ningún otro permiso.
   - Fecha de caducidad: anotarla. Al caducar, el vigía avisa (VIGIA_ROTO) y hay que crear otro token.
   - Copiar el valor a `GH_TOKEN` en `~/perdata-vigia/env`.

5. Telegram (opcional, recomendado). Crear un bot con @BotFather (obtiene `TELEGRAM_BOT_TOKEN`), escribirle
   un mensaje desde la cuenta de Agustín y consultar `https://api.telegram.org/bot<TOKEN>/getUpdates`
   para leer el `chat.id`; ese número va en `TELEGRAM_CHAT_ID`.

6. Prueba en seco (no envía avisos ni dispara workflows; solo lee y simula):

   ```
   cd ~/perdata-vigia && node vigia.mjs --seco
   ```

   Debe terminar sin error y escribir una línea en `~/.local/state/perdata-vigia.log`.

7. Cron. Añadir con `crontab -e`:

   ```
   */30 * * * * cd ~/perdata-vigia && node vigia.mjs --seco >> ~/perdata-vigia/cron.log 2>&1
   ```

   Si `node` no está en el PATH de cron, usar la ruta absoluta (`which node`).

## Activar (pasar de seco a real)

Hacer falta dos cambios; con uno solo sigue en seco:

1. En `~/perdata-vigia/env`, `VIGIA_ACTUAR=1`.
2. En la crontab, quitar `--seco` de la línea.

Conviene dejar una semana en seco y revisar cada mañana el resumen «[modo prueba]» y `perdata-vigia.log`
antes de activar.

## Modo seco

En seco el vigía no dispara ningún workflow ni envía avisos, pero sí lleva una memoria simulada aparte
(`~/.local/state/perdata-vigia.seco.json`) donde registra las acciones como si se hubieran hecho: contadores
de RELANZAR, DESPLEGAR y VOLVER_ATRAS, límites diarios, esperas y avisos suprimidos. Así el log en seco muestra
lo que haría en real, con sus límites. La memoria simulada no tiene nada que ver con la real.

El resumen diario de las 08:00 sí se envía en seco (si hay Telegram), marcado «[modo prueba]».

## Parar el vigía

- Para dejar de vigilar: `crontab -e` y borrar la línea. Si una pasada está en marcha, termina sola; el lock
  `~/.local/state/perdata-vigia.lock` evita pasadas solapadas y se libera al terminar.
- Para dejar de actuar sin parar el cron: `VIGIA_ACTUAR=0` (o quitar la variable). Vuelve al modo seco.

## Variables

Las variables del entorno del proceso mandan sobre el archivo. Ruta del archivo: `VIGIA_ENV_FILE` si
está definida; si no, `~/perdata-vigia/env`; si no existe, `~/.config/perdata-vigia/env`.

| Variable | Para qué |
|---|---|
| `VIGIA_ACTUAR` | `1` activa las acciones y los avisos reales. Cualquier otro valor (o nada) = modo seco. |
| `GH_TOKEN` | Token fine-grained de GitHub para `gh`. Se pasa solo al proceso `gh`, nunca por argumentos. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Avisos y resumen diario por Telegram. |
| `VIGIA_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM` | Avisos por correo con Resend, si Telegram no está configurado o falla. |
| `VIGIA_NVIDIA_API_KEY` | Clave de NVIDIA NIM, solo para clasificar fallos DESCONOCIDOS. |
| `VIGIA_MODELO` | Id exacto del modelo Nemotron. Si no existe, el vigía elige uno pequeño (lightning/nano) de `GET /v1/models`. |
| `VIGIA_ENV_FILE` | Ruta alternativa del archivo de entorno. |

`VIGIA_RESUMEN` ya no existe: el resumen diario sale siempre que haya Telegram configurado, actúe o no.

## Avisos

- Canal: Telegram primero (texto plano, máximo 3500 caracteres). Si no hay Telegram configurado o el envío
  falla, correo con Resend. Si no hay ninguno, el aviso queda solo en el log.
- Cada aviso lleva el código, el diagnóstico, la acción tomada, una línea «Qué hacer a mano:» con el comando
  de comprobación del RUNBOOK para ese código, y el final del log, redactado.
- Como mucho un aviso por código cada 6 h.
- Horas de silencio (23:00 a 07:00 de Lima): solo salen de noche PAGOS_ABIERTOS, PAGINA_CAIDA, SIN_LATIDO y la
  vuelta atrás ya ejecutada. Lo demás se acumula y va en el resumen de las 08:00. Las acciones no cambian.
- La redacción quita claves de Resend, NVIDIA, GitHub (`ghp_`, `gho_`, `github_pat_`, etc.), tokens de bot de
  Telegram (`NNNN:AAA...`), claves Stripe y los valores de variables tipo `KEY=`, `TOKEN=`, `SECRET=`.

## Resumen diario

A partir de las 08:00 (hora de Lima), una vez al día, se envía por Telegram (también en modo seco, marcado
«[modo prueba]») un mensaje de varias líneas:

```
[modo prueba] PerData · <fecha>
Pasadas de hoy: <n>. Runs en 24 h: <n>, fallos: <n>.
Incidentes de hoy por código: DATO_VIEJO 2, PAGINA_CAIDA 1.
Acciones que HABRÍA hecho (memoria simulada, 24 h): RELANZAR 1.     (en real: «Acciones del vigía (24 h)»)
Avisos acumulados en silencio: CI_ROJO (...); ninguno si no hay.
/api/status OK. Pagos en pausa: no.
```

Si no hay Telegram configurado, no se marca como enviado y se reintenta en la siguiente pasada. Al enviarse,
se vacían los avisos acumulados en silencio.

## Latido del servidor de casa (SIN_LATIDO)

Cada pasada avisa (sin actuar) si `/api/status` no responde o si el último run de cualquier workflow de datos
es de hace más de 4 h. Ver la sección SIN_LATIDO de `docs/RUNBOOK.md`.

## Servidor de casa (SERVIDOR_CASA)

Los planes B de la SMV corren en el servidor de casa (`wagus-server`, Tailscale, 100.120.75.115). Cada pasada
comprueba `tailscale status --json` (campo `Online` del par cuyo `HostName` contiene `wagus-server`) y, si no
da en línea, una conexión TCP al puerto 22 con 5 s de timeout. Si las dos fallan en dos pasadas seguidas,
AVISA; al recuperarse, avisa de nuevo. Si `tailscale` no existe, se salta ese chequeo sin error. Ver la sección
SERVIDOR_CASA de `docs/RUNBOOK.md`.

## Hechos de la SMV

En cada pasada, el vigía lee `data/smv-hechos.json` del repo (raíz `actualizado`, con `?t=` para no usar caché)
y avisa con SMV_BLOQUEO si tiene más de 48 h, aunque el watchdog no corra. Si el watchdog ya avisa de hechos por
encima de 48 h, no se duplica.

## Autodiagnóstico (VIGIA_ROTO)

Si `gh` responde 401/403 o «Bad credentials» (un límite de peticiones no cuenta), si la API de NVIDIA responde
401, o si Telegram falla dos envíos seguidos, el vigía avisa por el canal que funcione. Como máximo un aviso de
este tipo al día. El mensaje dice qué renovar y dónde (`~/perdata-vigia/env`). Ver VIGIA_ROTO en `docs/RUNBOOK.md`.

## Log de decisiones

Cada pasada escribe una línea (hora, modo, incidentes, acciones y fuentes fallidas) y, debajo, una línea por
incidente con su decisión:

```
  · SMV_BLOQUEO@watchdog: ESPERAR — hechos 34 h < 48 h, el plan B del servidor lo cubre (regla: SMV en el watchdog: esperar, no relanzar)
  · PAGOS_ABIERTOS: AVISAR — los pagos aparecen abiertos durante la pausa (regla: PAGOS_ABIERTOS: avisar de inmediato, nunca tocar) => enviado por telegram
```

## Archivos de estado

- `~/.local/state/perdata-vigia.json`: memoria real. Contadores del día, avisos recientes, despliegues, historial
  de acciones de 48 h, incidentes en seguimiento, avisos en silencio y fallos de Telegram.
- `~/.local/state/perdata-vigia.seco.json`: memoria simulada del modo seco (misma forma; nunca toca la real).
- `~/.local/state/perdata-vigia.log`: una línea por pasada más una por incidente (ver «Log de decisiones»).
- `~/perdata-vigia/cron.log`: salida de cron (solo errores de arranque o de Node).

## Pruebas

```
npm test                                   # incluye test/vigia.test.js (sin red)
node --check scripts/vigia.mjs             # sintaxis; el script debe funcionar con Node 20
/usr/bin/node --test test/vigia.test.js    # con Node 20 del sistema
VIGIA_ENV_FILE=<ruta-del-env> node scripts/vigia.mjs --seco   # una pasada en seco contra GitHub y perdata.site
```
