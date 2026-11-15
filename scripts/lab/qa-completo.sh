#!/usr/bin/env bash
# QA pesado de PerData: build en el servidor, recorrido con Playwright en la caja InstaBox.
# Deja el informe en /home/wagustin/kathy_workspace/qa/qa-AAAA-MM-DD.md (fuera del repo: puede tener datos).
# Uso: scripts/lab/qa-completo.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CAJA="${CAJA:-agustin-box}"
REMOTO="/data/home/perdata-lab/qa"
SALIDA_LOCAL="${SALIDA_QA:-/home/wagustin/kathy_workspace/qa}"
FECHA="$(date +%F)"
IB=(npx -y instabox@latest)

cd "$RAIZ"
node scripts/build-cf.js
test -f public/sitemap.xml || { echo "falta public/sitemap.xml tras el build"; exit 1; }
COMMIT="$(git rev-parse --short HEAD)"

echo "== subiendo public/ y el script a la caja"
# public/ va empaquetado: cp de instabox omite lo que git ignora y public/ está en .gitignore
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -C "$RAIZ" -czf "$TMP/public.tgz" public
"${IB[@]}" exec "$CAJA" -- "rm -rf $REMOTO/public $REMOTO/out && mkdir -p $REMOTO/out"
"${IB[@]}" cp "$TMP/public.tgz" "$CAJA:$REMOTO/public.tgz"
"${IB[@]}" exec "$CAJA" -- "tar -xzf $REMOTO/public.tgz -C $REMOTO && rm $REMOTO/public.tgz && test -f $REMOTO/public/sitemap.xml"
"${IB[@]}" cp scripts/lab/qa-pagina.mjs "$CAJA:$REMOTO/qa-pagina.mjs"

echo "== recorriendo en la caja (1440 y 390 px), en segundo plano"
# exec corta cada llamada a los 60 s, así que el recorrido va con nohup y se sondea su estado
"${IB[@]}" exec "$CAJA" -- "cd $REMOTO && rm -f out/FIN && (nohup sh -c 'node qa-pagina.mjs $REMOTO/public $REMOTO/out $FECHA $COMMIT > $REMOTO/out/log.txt 2>&1; echo \$? > $REMOTO/out/FIN' > /dev/null 2>&1 < /dev/null &)"
for _ in $(seq 1 240); do
  sleep 30
  salida="$("${IB[@]}" exec "$CAJA" -- "echo \"\$(tail -n1 $REMOTO/out/log.txt 2>/dev/null)\"; test -f $REMOTO/out/FIN && echo FIN=\$(cat $REMOTO/out/FIN) || echo FIN=pendiente")"
  echo "$salida" | head -n1
  if [ "$(echo "$salida" | tail -n1)" != "FIN=pendiente" ]; then break; fi
done
ESTADO="$(echo "$salida" | tail -n1)"
if [ "$ESTADO" != "FIN=0" ]; then
  echo "el recorrido falló ($ESTADO); log en la caja: $REMOTO/out/log.txt"
  "${IB[@]}" exec "$CAJA" -- "tail -n 30 $REMOTO/out/log.txt" || true
  exit 1
fi

echo "== trayendo el informe"
mkdir -p "$SALIDA_LOCAL"
"${IB[@]}" cp "$CAJA:$REMOTO/out/informe-$FECHA.md" "$SALIDA_LOCAL/qa-$FECHA.md"
echo "Informe: $SALIDA_LOCAL/qa-$FECHA.md"
