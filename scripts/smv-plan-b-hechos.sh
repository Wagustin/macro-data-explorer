#!/usr/bin/env bash
# Plan B de los hechos de importancia de la SMV: si GitHub Actions no puede bajar la SMV (HTTP 418),
# el servidor ejecuta scripts/fetch-smv.js en un worktree propio y publica data/smv-hechos.json en main.
# Cron propuesto (no instalado): 20 6,14 * * * UTC.
# Uso manual: bash scripts/smv-plan-b-hechos.sh
# Variables: REPO (clon principal); DATA_WT (worktree exclusivo de este script); PLANB_SECO=1 descarga
# pero no hace commit ni push; PLANB_FORZAR=1 salta el chequeo de las 20 h.
set -euo pipefail

export PATH=/home/wagustin/.nvm/versions/node/v22.23.2/bin:$PATH
REPO="${REPO:-/home/wagustin/macro-data-explorer}"
DATA_WT="${DATA_WT:-/home/wagustin/kathy_workspace/wt-planb-data}"
FICHERO="data/smv-hechos.json"
STATE="$HOME/.local/state"
LOG="$STATE/smv-plan-b.log"
LOCK="$STATE/smv-plan-b-hechos.lock"
mkdir -p "$STATE"

log() { echo "$(date -u +%FT%TZ) hechos: $*" | tee -a "$LOG"; }

exec 9>"$LOCK"
if ! flock -n 9; then
  log "omitido: otra ejecución en curso"
  exit 0
fi

# Worktree propio y limpio: se crea una vez y en cada ejecución queda igual que origin/main
if [ ! -e "$DATA_WT/.git" ]; then
  git -C "$REPO" fetch -q origin main
  git -C "$REPO" worktree add -q --detach "$DATA_WT" origin/main
fi
if ! git -C "$DATA_WT" fetch -q origin main; then
  log "error: git fetch falló"
  exit 1
fi
git -C "$DATA_WT" checkout -q -f --detach origin/main
git -C "$DATA_WT" reset -q --hard origin/main

# Fecha de «actualizado» de data/smv-hechos.json, o cadena vacía si no se puede leer
leer_actualizado() {
  node -e 'try { process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).actualizado || "") } catch (e) {}' "$DATA_WT/$FICHERO"
}

ACTUALIZADO=$(leer_actualizado)
if [ "${PLANB_FORZAR:-0}" != 1 ] && [ -n "$ACTUALIZADO" ]; then
  EDAD=$(node -e 'const t = Date.parse(process.argv[1]); process.stdout.write(Number.isNaN(t) ? "999" : ((Date.now() - t) / 3600000).toFixed(1))' "$ACTUALIZADO")
  if [ "$(awk -v e="$EDAD" 'BEGIN { print (e < 20) }')" = 1 ]; then
    log "sin cambios: hechos actualizados hace ${EDAD} h (menos de 20 h)"
    exit 0
  fi
fi

# SALIDA y RC son globales: el script necesita el código de salida sin que set -e aborte
descargar() {
  set +e
  SALIDA=$(cd "$DATA_WT" && node scripts/fetch-smv.js 2>&1)
  RC=$?
  set -e
  echo "$SALIDA" | tail -n 3
  if [ "$RC" -ne 0 ]; then
    log "descarga fallida: rc=$RC"
    exit 1
  fi
}

descargar
DESPUES=$(leer_actualizado)
if [ "$DESPUES" = "$ACTUALIZADO" ]; then
  log "sin cambios: la SMV no devolvió datos nuevos (actualizado $ACTUALIZADO)"
  exit 0
fi

MENSAJE="data(smv): hechos de importancia $(date -u +%F) (plan B del servidor)"
CAMBIOS=$(git -C "$DATA_WT" diff --shortstat -- "$FICHERO")

if [ "${PLANB_SECO:-0}" = 1 ]; then
  log "(seco) hechos descargados (${CAMBIOS:-sin diff de contenido}); haría commit «$MENSAJE» y push a main"
  exit 0
fi

confirmar() {
  git -C "$DATA_WT" add -- "$FICHERO"
  git -C "$DATA_WT" -c user.name=perdata-bot -c user.email=perdata-bot@users.noreply.github.com \
    commit -q -m "$MENSAJE"
}

confirmar
RECARGADO=0
for i in 1 2 3 4; do
  if ! git -C "$DATA_WT" pull --rebase -q origin main; then
    git -C "$DATA_WT" rebase --abort 2>/dev/null || true
    if [ "$RECARGADO" -eq 1 ]; then
      log "error: el rebase falla también tras recargar la SMV"
      exit 1
    fi
    RECARGADO=1
    log "aviso: rebase con conflicto; descarto el commit y recargo la SMV una vez"
    git -C "$DATA_WT" reset -q --hard origin/main
    BASE=$(leer_actualizado)
    descargar
    if [ "$(leer_actualizado)" = "$BASE" ]; then
      log "sin cambios tras recargar (actualizado $BASE)"
      exit 0
    fi
    confirmar
    continue
  fi
  if git -C "$DATA_WT" push -q origin HEAD:main; then
    log "publicado en main: $(git -C "$DATA_WT" log -1 --format='%h %s') (${CAMBIOS:-sin diff de contenido})"
    exit 0
  fi
  if [ "$i" -eq 4 ]; then
    log "error: push falló 4 veces"
    exit 1
  fi
  sleep $((i * 5))
done
