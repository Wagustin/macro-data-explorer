import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publicarImagenes } from "../scripts/lib/imagenes-correo.js";

// Script bash falso: imprime la salida indicada o sale con error.
function scriptFalso(dir, salida = "", error = false) {
  const p = path.join(dir, "publicar.sh");
  const cuerpo = error ? "echo 'fallo' >&2\nexit 1\n" : `echo ${JSON.stringify(salida)}\n`;
  fs.writeFileSync(p, `#!/usr/bin/env bash\n${cuerpo}`);
  return p;
}

const png = (n) => Buffer.from([0x89, 0x50, 0x4e, 0x47, n]);
const resp = (status, tipo) => ({ status, headers: { get: () => tipo } });

// fetch falso: responde con la lista de respuestas (la última se repite).
function fetchFalso(respuestas) {
  const llamadas = [];
  const fn = async (url) => {
    llamadas.push(url);
    return respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
  };
  fn.llamadas = llamadas;
  return fn;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "test-imagenes-correo-"));
const silencioso = () => [];

test("publicarImagenes: publica los PNG, devuelve la base y comprueba la descarga", async () => {
  const t = tmp();
  const dir = path.join(t, "png");
  const cmd = scriptFalso(t, "https://ejemplo.invalid/x/2026-11-10");
  const archivos = new Map([["dolar.png", png(1)], ["dolar-hoy.png", png(2)]]);
  const fetchImpl = fetchFalso([resp(200, "image/png")]);

  const out = await publicarImagenes({ archivos, fecha: "2026-11-10", cmd, dir, fetchImpl, esperaMs: 1, log: silencioso });

  assert.ok(out, "devuelve el resultado");
  assert.equal(out.base, "https://ejemplo.invalid/x/2026-11-10");
  assert.deepEqual([...out.archivos], ["dolar.png", "dolar-hoy.png"]);
  // Los archivos quedan escritos en `dir` con sus bytes.
  assert.deepEqual(fs.readFileSync(path.join(dir, "dolar.png")), archivos.get("dolar.png"));
  assert.deepEqual(fs.readFileSync(path.join(dir, "dolar-hoy.png")), archivos.get("dolar-hoy.png"));
  // Se comprueba que el primer PNG ya se puede descargar.
  assert.deepEqual(fetchImpl.llamadas, ["https://ejemplo.invalid/x/2026-11-10/dolar.png"]);
});

test("publicarImagenes: si el script falla, devuelve null y no lanza", async () => {
  const t = tmp();
  const cmd = scriptFalso(t, "", true);
  const logs = [];
  const out = await publicarImagenes({
    archivos: new Map([["dolar.png", png(1)]]), fecha: "2026-11-10", cmd,
    dir: path.join(t, "png"), fetchImpl: fetchFalso([resp(200, "image/png")]), esperaMs: 1, log: (m) => logs.push(m),
  });
  assert.equal(out, null);
  assert.equal(logs.length, 1, "avisa que las imágenes no se publicaron");
  assert.match(logs[0], /^Imágenes no publicadas: .* \(el correo sale sin imágenes\)$/);
});

test("publicarImagenes: si el script no devuelve una URL https, devuelve null", async () => {
  const t = tmp();
  const cmd = scriptFalso(t, "esto no es una URL");
  const out = await publicarImagenes({
    archivos: new Map([["dolar.png", png(1)]]), fecha: "2026-11-10", cmd,
    dir: path.join(t, "png"), fetchImpl: fetchFalso([resp(200, "image/png")]), esperaMs: 1, log: silencioso,
  });
  assert.equal(out, null);
});

test("publicarImagenes: si el PNG nunca se descarga, devuelve null tras `intentos` intentos", async () => {
  const t = tmp();
  const cmd = scriptFalso(t, "https://ejemplo.invalid/x/2026-11-10");
  const fetchImpl = fetchFalso([resp(404, "text/html")]);
  const out = await publicarImagenes({
    archivos: new Map([["dolar.png", png(1)]]), fecha: "2026-11-10", cmd,
    dir: path.join(t, "png"), fetchImpl, intentos: 4, esperaMs: 1, log: silencioso,
  });
  assert.equal(out, null);
  assert.equal(fetchImpl.llamadas.length, 4, "intenta las veces acordadas");
});

test("publicarImagenes: si el PNG aparece después, funciona al tercer intento", async () => {
  const t = tmp();
  const cmd = scriptFalso(t, "https://ejemplo.invalid/x/2026-11-10");
  const fetchImpl = fetchFalso([resp(404, "text/html"), resp(404, "text/html"), resp(200, "image/png")]);
  const out = await publicarImagenes({
    archivos: new Map([["dolar.png", png(1)]]), fecha: "2026-11-10", cmd,
    dir: path.join(t, "png"), fetchImpl, intentos: 6, esperaMs: 1, log: silencioso,
  });
  assert.ok(out, "devuelve el resultado");
  assert.equal(out.base, "https://ejemplo.invalid/x/2026-11-10");
  assert.equal(fetchImpl.llamadas.length, 3, "sondea hasta que el PNG responde");
});

test("publicarImagenes: sin comando no hace nada", async () => {
  const t = tmp();
  const dir = path.join(t, "png");
  const fetchImpl = fetchFalso([resp(200, "image/png")]);
  const out = await publicarImagenes({
    archivos: new Map([["dolar.png", png(1)]]), fecha: "2026-11-10", cmd: "",
    dir, fetchImpl, esperaMs: 1, log: silencioso,
  });
  assert.equal(out, null);
  assert.equal(fs.existsSync(dir), false, "no escribe nada");
  assert.equal(fetchImpl.llamadas.length, 0, "no descarga nada");
});
