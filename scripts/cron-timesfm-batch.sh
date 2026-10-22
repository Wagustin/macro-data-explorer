#!/usr/bin/env bash
# Cron wrapper for PerData daily TimesFM 2.5 batch (06:00 PET / 11:00 UTC)
export PATH="/usr/local/cuda/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="/home/wagustin/macro-data-explorer"
VENV_PY="/home/wagustin/kathy_workspace/timesfm-backtest/venv/bin/python3"
BITACORA="/home/wagustin/obsidian_vault/02 🚀 Proyectos & IA/00 📈 PerData - Bitácora de Kathy.md"

cd "$DIR" || exit 1
OUTPUT=$("$VENV_PY" scripts/timesfm_batch.py 2>&1)
STATUS=$?

if [ $STATUS -ne 0 ]; then
  NOW=$(date "+%Y-%m-%d %H:%M")
  if [ -f "$BITACORA" ]; then
    python3 -c "
path = '$BITACORA'
now = '$NOW'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
target = '## 2026'
idx = content.find(target)
if idx != -1:
    line = f'- TIMESFM FAIL ({now}): ejecución batch de TimesFM 2.5 falló con código $STATUS\\n'
    new_content = content[:idx] + line + content[idx:]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
"
  fi
fi
