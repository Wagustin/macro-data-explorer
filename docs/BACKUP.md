# Copias de seguridad

El Worker guarda cada día las tablas irrecuperables `users` y `boletin_suscriptores` en el bucket R2 `kathy-vault`, bajo `backups/AAAA-MM-DD.json.enc`. Las copias se cifran antes de subirlas y se conservan durante 14 días.

Para restaurar o inspeccionar una copia, descarga el archivo y ejecuta:

```sh
JWT_SECRET=... node scripts/restore-backup.mjs archivo.json.enc
```

El resultado descifrado se escribe por stdout. La clave de cifrado es `JWT_SECRET`; si se rota, las copias anteriores solo se pueden abrir con el valor anterior. Guarda ese valor de forma segura.
