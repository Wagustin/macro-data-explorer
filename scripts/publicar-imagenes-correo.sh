#!/usr/bin/env bash
# Publica los PNG del correo en la rama «correo-img» del repositorio, para que el
# correo real los referencie en raw.githubusercontent.com.
# Uso: bash scripts/publicar-imagenes-correo.sh <carpeta-con-png> <AAAA-MM-DD>
# Por stdout sale solo la URL base; todo lo demás va a stderr.
set -euo pipefail

DIR=${1:-}
FECHA=${2:-}
if [[ -z "$DIR" || -z "$FECHA" ]]; then
  echo "Uso: bash $0 <carpeta-con-png> <AAAA-MM-DD>" >&2
  exit 2
fi
if [[ ! "$FECHA" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Fecha invalida: $FECHA (se espera AAAA-MM-DD)" >&2
  exit 2
fi

REMOTO=${CORREO_IMG_REMOTO:-origin}
REPO=$(git rev-parse --show-toplevel)
WORK=$(mktemp -d)
TMP_BRANCH="correo-img-tmp-$$"
REF_TMP="refs/correo-img/tmp"
# Sin credenciales disponibles, git falla de inmediato en vez de pedir una.
export GIT_TERMINAL_PROMPT=0

# El repositorio queda como estaba: sin worktrees colgando, sin rama local
# «correo-img» y sin refs de paso.
limpia() {
  git -C "$REPO" worktree remove --force "$WORK" >/dev/null 2>&1 || true
  rm -rf "$WORK"
  git -C "$REPO" worktree prune >/dev/null 2>&1 || true
  git -C "$REPO" branch -D "$TMP_BRANCH" >/dev/null 2>&1 || true
  git -C "$REPO" update-ref -d "$REF_TMP" >/dev/null 2>&1 || true
}
trap limpia EXIT

if ! git -C "$REPO" remote get-url "$REMOTO" >/dev/null 2>&1; then
  echo "El remoto «$REMOTO» no existe" >&2
  exit 1
fi

shopt -s nullglob
PNGS=("$DIR"/*.png)
if ((${#PNGS[@]} == 0)); then
  echo "No hay PNG en $DIR" >&2
  exit 1
fi

# La rama vive aparte de main: si ya está en el remoto se parte de ella; si no,
# se crea huérfana (sin historia ni archivos de main).
if git -C "$REPO" fetch --quiet "$REMOTO" "+refs/heads/correo-img:$REF_TMP" >/dev/null 2>&1; then
  git -C "$REPO" worktree add --quiet --detach "$WORK" FETCH_HEAD >&2
else
  git -C "$REPO" worktree add --quiet --detach "$WORK" >&2
  git -C "$WORK" checkout --quiet --orphan "$TMP_BRANCH" >&2
  git -C "$WORK" rm -rfq --ignore-unmatch . >&2 || true
fi

# Los PNG del día (reemplazando los que hubiera) y la poda de los días viejos.
mkdir -p "$WORK/$FECHA"
for viejo in "$WORK/$FECHA"/*.png; do rm -f "$viejo"; done
cp "${PNGS[@]}" "$WORK/$FECHA/"

CUTOFF=$(date -u -d "$FECHA -30 days" +%F)
for carpeta in "$WORK"/*/; do
  nombre=$(basename "$carpeta")
  if [[ "$nombre" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$nombre" < "$CUTOFF" ]]; then
    rm -rf "$carpeta"
  fi
done

git -C "$WORK" add -A
if [[ -n "$(git -C "$WORK" status --porcelain)" ]]; then
  git -C "$WORK" -c user.name=perdata-bot -c user.email=perdata-bot@users.noreply.github.com \
    commit --quiet -m "img(correo): $FECHA" >&2
  git -C "$WORK" push --quiet "$REMOTO" HEAD:refs/heads/correo-img >&2
fi

echo "https://raw.githubusercontent.com/${GITHUB_REPOSITORY:-Wagustin/macro-data-explorer}/correo-img/$FECHA"
