# Copias de seguridad

El Worker guarda cada día las tablas no regenerables (`users`, `boletin_suscriptores`, `seguimiento`, `trial_tarjetas`, `alertas_enviadas` y `etiquetas_noticias`) en el bucket R2 `kathy-vault`, bajo `backups/AAAA-MM-DD.json.enc`. Si alguna tabla aún no existe en Supabase (HTTP 404 o relación inexistente), se omite sin romper el respaldo. Las copias se cifran antes de subirlas y se conservan durante 14 días.

El workflow `backup.yml` (`scripts/backup.sh`) es un método alternativo manual que respalda las mismas tablas más `forecast_history`, `forecasts`, `cotizaciones_smv` y `sentimiento_diario` (también tolera tablas inexistentes) y requiere `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` y `BACKUP_KEY`.

Para restaurar o inspeccionar una copia, descarga el archivo y ejecuta:

```sh
BACKUP_KEY=... node scripts/restore-backup.mjs archivo.json.enc
```

El resultado descifrado se escribe por stdout. La clave de cifrado es `BACKUP_KEY` (mínimo 32 caracteres) y debe configurarse como secreto del Worker. En el servidor, guarda una copia en `~/kathy_workspace/infra/backup_key.txt` con permisos `600`. Si se rota, las copias antiguas solo se pueden abrir con el valor anterior. Sin la clave, los datos son irrecuperables.
