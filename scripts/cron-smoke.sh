#!/usr/bin/env bash
# Cron wrapper for PerData daily production smoke test (07:30 PET / 12:30 UTC)
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="/home/wagustin/macro-data-explorer"
BITACORA="/home/wagustin/obsidian_vault/02 🚀 Proyectos & IA/00 📈 PerData - Bitácora de Kathy.md"

cd "$DIR" || exit 1
OUTPUT=$(node scripts/smoke.js --base https://perdata.site 2>&1)
STATUS=$?

if [ $STATUS -ne 0 ]; then
  NOW=$(date "+%Y-%m-%d %H:%M")
  FAIL_SUMMARY=$(echo "$OUTPUT" | grep -E "FAIL" | head -n 5 | sed -e 's/^[[:space:]]*//' | tr '\n' '; ' | cut -c 1-250)
  if [ -f "$BITACORA" ]; then
    python3 -c "
import sys
path = '$BITACORA'
now = '$NOW'
summary = '$FAIL_SUMMARY'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
target = '## 2026'
idx = content.find(target)
if idx != -1:
    new_content = content[:idx] + f'- SMOKE FAIL ({now}): {summary}\n' + content[idx:]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
"
  fi
fi
