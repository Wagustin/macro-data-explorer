// Publica los PNG del correo (precios y rangos, nada más) y devuelve la URL
// base desde la que se pueden referenciar. Nunca lanza: si algo falla, el
// correo sale sin imágenes, como antes.
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Avisa sin que un fallo del logger rompa el correo.
const avisa = (log, mensaje) => {
  try { log(mensaje); } catch {}
};

// content-type del headers de fetch (tolera un objeto plano).
const contentType = (res) => {
  const h = res?.headers;
  if (!h) return "";
  if (typeof h.get === "function") return String(h.get("content-type") || "");
  return String(h["content-type"] || h["Content-Type"] || "");
};

const esPng = (res) => {
  const status = Number(res?.status);
  const ok = Number.isFinite(status) ? status === 200 : Boolean(res?.ok);
  return ok && contentType(res).toLowerCase().startsWith("image/png");
};

export async function publicarImagenes({
  archivos, fecha, cmd, dir, fetchImpl = fetch, intentos = 6, esperaMs = 5000, log = console.log,
}) {
  // Sin comando o sin PNG no hay nada que publicar.
  if (!cmd || !archivos || archivos.size === 0) return null;
  try {
    const nombres = [...archivos.keys()];
    const carpeta = dir || fs.mkdtempSync(path.join(os.tmpdir(), "correo-img-"));
    fs.mkdirSync(carpeta, { recursive: true });
    for (const nombre of nombres) fs.writeFileSync(path.join(carpeta, nombre), archivos.get(nombre));

    const salida = String(execFileSync("bash", [cmd, carpeta, fecha], {
      encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "inherit"],
    }) || "").trim();
    if (!/^https:\/\/\S+$/.test(salida)) {
      avisa(log, "Imágenes no publicadas: el comando no devolvió una URL https (el correo sale sin imágenes)");
      return null;
    }
    const base = salida;

    // La rama puede tardar unos segundos en estar disponible en GitHub.
    const primero = nombres[0];
    for (let intento = 1; intento <= intentos; intento++) {
      let res = null;
      try {
        res = await fetchImpl(`${base}/${primero}`, { signal: AbortSignal.timeout(20000) });
      } catch (e) {
        res = null;
      }
      if (esPng(res)) return { base, archivos: new Set(nombres) };
      if (intento < intentos) await dormir(esperaMs);
    }
    avisa(log, `Imágenes no publicadas: ${base}/${primero} no respondió con un PNG (el correo sale sin imágenes)`);
    return null;
  } catch (e) {
    avisa(log, `Imágenes no publicadas: ${e.message} (el correo sale sin imágenes)`);
    return null;
  }
}
