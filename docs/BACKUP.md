# Copias de seguridad

El Worker guarda cada día las tablas irrecuperables `users` y `boletin_suscriptores` en el bucket R2 `kathy-vault`, bajo `backups/AAAA-MM-DD.json.enc`. Las copias se cifran antes de subirlas y se conservan durante 14 días.

El workflow `backup.yml` es un método alternativo manual y requiere `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` y `BACKUP_KEY`.

Para restaurar o inspeccionar una copia, descarga el archivo y ejecuta:

```sh
BACKUP_KEY=... node scripts/restore-backup.mjs archivo.json.enc
```

El resultado descifrado se escribe por stdout. La clave de cifrado es `BACKUP_KEY` (mínimo 32 caracteres) y debe configurarse como secreto del Worker. En el servidor, guarda una copia en `~/kathy_workspace/infra/backup_key.txt` con permisos `600`. Si se rota, las copias antiguas solo se pueden abrir con el valor anterior. Sin la clave, los datos son irrecuperables.
