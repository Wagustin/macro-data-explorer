#!/usr/bin/env bash
set -euo pipefail

BUCKET="kathy-vault"
TABLES=(
  users
  boletin_suscriptores
  seguimiento
  trial_tarjetas
  alertas_enviadas
  forecast_history
  etiquetas_noticias
  forecasts
  cotizaciones_smv
  sentimiento_diario
)
PAGE_SIZE=1000

for name in SUPABASE_URL SUPABASE_SERVICE_KEY BACKUP_KEY R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
DATE="$(date -u +%F)"

backed_up=()
for table in "${TABLES[@]}"; do
  pages=()
  offset=0
  missing=0
  while true; do
    page="$WORK_DIR/${table}-${offset}.json"
    status="$(curl --silent --show-error \
      --output "$page" --write-out '%{http_code}' \
      -H "apikey: $SUPABASE_SERVICE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
      -H "Range-Unit: items" \
      -H "Range: ${offset}-$((offset + PAGE_SIZE - 1))" \
      "$SUPABASE_URL/rest/v1/$table?select=*")"
    if [[ "$status" != 2* ]]; then
      if (( offset == 0 )) && { [[ "$status" == "404" ]] || grep -qiE 'relation .* does not exist|could not find the table|PGRST205' "$page"; }; then
        echo "Warning: skipping missing table $table (HTTP $status)" >&2
        rm -f "$page"
        missing=1
        break
      fi
      cat "$page" >&2 || true
      echo "Backup failed for table $table (HTTP $status)" >&2
      exit 1
    fi
    pages+=("$page")
    count="$(jq 'length' "$page")"
    (( count < PAGE_SIZE )) && break
    offset=$((offset + PAGE_SIZE))
  done
  if (( missing == 0 )); then
    jq -s 'add' "${pages[@]}" > "$WORK_DIR/$table.json"
    backed_up+=("$table.json")
  fi
done

if (( ${#backed_up[@]} == 0 )); then
  echo "Backup failed: no tables backed up" >&2
  exit 1
fi

tar -czf "$WORK_DIR/backup.tar.gz" -C "$WORK_DIR" "${backed_up[@]}"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$WORK_DIR/backup.tar.gz" \
  -out "$WORK_DIR/backup.tar.gz.enc" -pass env:BACKUP_KEY

aws s3 cp "$WORK_DIR/backup.tar.gz.enc" \
  "s3://$BUCKET/backups/$DATE/backup.tar.gz.enc" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors

objects="$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix backups/ \
  --endpoint-url "$R2_ENDPOINT" --query 'Contents[].Key' --output text)"
cutoff="$(date -u -d '14 days ago' +%F)"
while IFS= read -r key; do
  [[ "$key" == backups/*/* ]] || continue
  object_date="${key#backups/}"
  object_date="${object_date%%/*}"
  if [[ "$object_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$object_date" < "$cutoff" ]]; then
    aws s3 rm "s3://$BUCKET/$key" --endpoint-url "$R2_ENDPOINT" --only-show-errors
  fi
done < <(tr '\t' '\n' <<< "$objects")

echo "Encrypted Supabase backup uploaded for $DATE; expired backups removed."
