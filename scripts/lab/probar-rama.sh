#!/usr/bin/env bash
# Prueba una rama en la caja InstaBox: npm ci, npm test y build (node scripts/build-cf.js).
# Si la rama está en GitHub se clona; si no, se copia la rama local (el worktree si es la actual,
# con sus cambios sin commit; si no, lo commiteado con git archive). Sin dependencias, build ni secretos.
# Uso: scripts/lab/probar-rama.sh <rama>
set -uo pipefail

RAMA="${1:?uso: scripts/lab/probar-rama.sh <rama>}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CAJA="${CAJA:-agustin-box}"
REPO_URL="https://github.com/Wagustin/macro-data-explorer"
NOMBRE="$(printf '%s' "$RAMA" | tr -c 'A-Za-z0-9._-' '_')"
REMOTO="/data/home/perdata-lab/ramas/$NOMBRE"
IB=(npx -y instabox@latest)

if git ls-remote --exit-code --heads "$REPO_URL" "$RAMA" >/dev/null 2>&1; then
  ORIGEN="GitHub"
  "${IB[@]}" exec "$CAJA" -- "rm -rf '$REMOTO' && mkdir -p '$(dirname "$REMOTO")' && git clone -q --depth 50 --branch '$RAMA' '$REPO_URL' '$REMOTO'" \
    || { echo "no se pudo clonar $RAMA en la caja"; exit 1; }
else
  ORIGEN="local"
  ACTUAL="$(git -C "$RAIZ" branch --show-current)"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  if [ "$ACTUAL" = "$RAMA" ]; then
    echo "aviso: la rama no está en GitHub; se copia el worktree actual con sus cambios sin commit"
    tar -C "$RAIZ" -czf "$TMP/rama.tgz" \
      --exclude=./node_modules --exclude=./public --exclude=./.git \
      --exclude='.env' --exclude='.env.*' --exclude='*.env' --exclude='*.key' --exclude='*.pem' \
      --exclude='*.token' --exclude='*secret*' --exclude='*credential*' .
  else
    git -C "$RAIZ" rev-parse --verify -q "$RAMA" >/dev/null || { echo "la rama $RAMA no existe ni en GitHub ni localmente"; exit 1; }
    git -C "$RAIZ" archive --format=tar.gz -o "$TMP/rama.tgz" "$RAMA"
  fi
  "${IB[@]}" exec "$CAJA" -- "rm -rf '$REMOTO' && mkdir -p '$REMOTO'"
  "${IB[@]}" cp "$TMP/rama.tgz" "$CAJA:$REMOTO/rama.tgz" || { echo "no se pudo subir la rama"; exit 1; }
  "${IB[@]}" exec "$CAJA" -- "tar -xzf '$REMOTO/rama.tgz' -C '$REMOTO' && rm '$REMOTO/rama.tgz'" || exit 1
fi

echo "== probando $RAMA (origen: $ORIGEN) en la caja, en segundo plano"
# exec corta cada llamada a los 60 s: los pasos van con nohup y se sondea su estado
"${IB[@]}" exec "$CAJA" -- "cd '$REMOTO' && rm -f FIN && (nohup sh -c 'npm ci --no-audit --no-fund > ci.log 2>&1; echo CI=\$? > FIN.parcial; npm test > test.log 2>&1; echo TEST=\$? >> FIN.parcial; node scripts/build-cf.js > build.log 2>&1; echo BUILD=\$? >> FIN.parcial; mv FIN.parcial FIN' > /dev/null 2>&1 < /dev/null &)"
for _ in $(seq 1 240); do
  sleep 30
  estado="$("${IB[@]}" exec "$CAJA" -- "cd '$REMOTO' && (cat FIN.parcial FIN 2>/dev/null; true)")"
  if echo "$estado" | grep -q 'BUILD='; then break; fi
done
echo "$estado"
"${IB[@]}" exec "$CAJA" -- "cd '$REMOTO' && echo COMMIT=\$(git rev-parse --short HEAD 2>/dev/null) && echo PASAN=\$(grep -E '^# pass ' test.log | awk '{print \$3}') FALLAN=\$(grep -E '^# fail ' test.log | awk '{print \$3}') && grep -E '^not ok' test.log | head -20 | sed 's/^/  /'; tail -n 3 build.log" || true
