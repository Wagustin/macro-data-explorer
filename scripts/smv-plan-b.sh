#!/usr/bin/env bash
# Plan B de la SMV: si GitHub Actions no puede bajar la SMV (HTTP 418), el servidor descarga las
# cotizaciones y lanza los workflows que hacen el resto. Cron del servidor: 02:40 UTC (21:40 Lima).
# Uso manual: bash scripts/smv-plan-b.sh
# Variables: REPO (clon con .env); PLANB_SECO=1 no lanza ningún workflow; PLANB_FORZAR=1 salta el
# chequeo de runs recientes (pruebas manuales).
set -euo pipefail

export PATH=/home/wagustin/.nvm/versions/node/v22.23.2/bin:$PATH
REPO="${REPO:-/home/wagustin/macro-data-explorer}"
GH_REPO="Wagustin/macro-data-explorer"
STATE="$HOME/.local/state"
LOG="$STATE/smv-plan-b.log"
LOCK="$STATE/smv-plan-b.lock"
mkdir -p "$STATE"

log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }

exec 9>"$LOCK"
if ! flock -n 9; then
  log "omitido: otra ejecución en curso"
  exit 0
fi

if ! git -C "$REPO" pull -q --ff-only; then
  log "aviso: git pull falló, sigo con lo que hay"
fi

# Runs de las últimas 20 h: "exito" si alguno terminó bien, "activo" si hay uno en curso, "nada" si no
if ! ESTADO=$(gh run list -R "$GH_REPO" --workflow smv-precios.yml -L 5 \
    --json conclusion,status,createdAt,event -q '
      [.[] | select((.createdAt | fromdateiso8601) > (now - 72000))] as $r
      | if any($r[]; .conclusion == "success") then "exito"
        elif any($r[]; .status == "in_progress" or .status == "queued" or .status == "waiting") then "activo"
        else "nada" end'); then
  log "error: gh run list falló"
  exit 1
fi

if [ "${PLANB_FORZAR:-0}" != 1 ]; then
  case "$ESTADO" in
    exito) log "sin cambios: ya hay un run de smv-precios con éxito en las últimas 20 h"; exit 0 ;;
    activo) log "sin cambios: hay un run de smv-precios en curso"; exit 0 ;;
  esac
fi

set +e
SALIDA=$(node --env-file="$REPO/.env" "$REPO/scripts/fetch-smv-precios.js" 2>&1)
RC=$?
set -e
echo "$SALIDA" | tail -n 3

RESUMEN=$(grep 'valores consultados' <<<"$SALIDA" | tail -n 1 || true)
FILAS=$(sed -n 's/.* \([0-9][0-9]*\) filas guardadas.*/\1/p' <<<"$RESUMEN")
VALORES=$(sed -n 's/^SMV: \([0-9]*\/[0-9]*\) valores consultados.*/\1/p' <<<"$RESUMEN")

if [ "$RC" -ne 0 ] || [ -z "$RESUMEN" ] || [ "${FILAS:-0}" -le 0 ]; then
  log "descarga fallida: rc=$RC valores=${VALORES:-?} filas=${FILAS:-0}"
  exit 1
fi

lanzar() {
  if [ "${PLANB_SECO:-0}" = 1 ]; then
    echo "PLANB_SECO=1: no lanzo $*" >&2
    return 0
  fi
  if ! gh workflow run "$@" -R "$GH_REPO"; then
    log "error: no pude lanzar $1"
    exit 1
  fi
}

ACCION="smv-precios(saltar_descarga=1)"
lanzar smv-precios.yml -f saltar_descarga=1
if ! grep -Eq '^[[:space:]]*(export[[:space:]]+)?SYNC_SECRET=.+' "$REPO/.env"; then
  lanzar d1-backfill.yml
  ACCION="$ACCION + d1-backfill"
fi
[ "${PLANB_SECO:-0}" = 1 ] && ACCION="(seco) $ACCION"

log "descarga ok: valores=$VALORES filas=$FILAS accion=$ACCION"
