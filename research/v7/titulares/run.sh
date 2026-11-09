#!/usr/bin/env bash
# run.sh — Ejecución desatendida del downloader de titulares GDELT.
# Uso: ./run.sh
# Requisitos: flock (util-linux), nice, ionice, node >= 18.
# Se relanza cada 15 min vía systemd --user timer (ver titulares.timer / titulares.service).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${TITULARES_DATA_DIR:-/home/wagustin/v7/data/titulares}"
LOCK_FILE="${DATA_DIR}/.run.lock"
LOG_FILE="/home/wagustin/v7/logs/titulares-run.log"
DOWNLOADER="${SCRIPT_DIR}/downloader.mjs"

# Ensure directories exist
mkdir -p "${DATA_DIR}"
mkdir -p "$(dirname "${LOG_FILE}")"

# flock -n: fail immediately if lock held (another instance running)
# Use file descriptor 200 for the lock
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
  echo "$(date -Iseconds) Otra instancia en ejecución. Saliendo." >> "${LOG_FILE}"
  exit 0
fi

# Run with low CPU and I/O priority
# nice -n 19 = lowest CPU priority
# ionice -c3 = idle I/O class (only when disk is idle)
exec nice -n 19 ionice -c3 node "${DOWNLOADER}" "$@" >> "${LOG_FILE}" 2>&1