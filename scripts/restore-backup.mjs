import fs from "node:fs/promises";
import { decryptBackup } from "../api/_lib/backup.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: BACKUP_KEY=... node scripts/restore-backup.mjs archivo.json.enc");
  process.exit(2);
}

try {
  const backup = await decryptBackup(await fs.readFile(file, "utf8"), process.env.BACKUP_KEY);
  process.stdout.write(`${JSON.stringify(backup, null, 2)}\n`);
} catch (error) {
  console.error(`No se pudo descifrar la copia: ${error.message}`);
  process.exit(1);
}
