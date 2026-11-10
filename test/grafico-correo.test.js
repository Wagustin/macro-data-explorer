import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { encodePng } from "../scripts/lib/png.js";
import { graficoRango } from "../scripts/lib/grafico-correo.js";

// Decodifica el PNG (solo lo necesario para las pruebas: firma, IHDR, IDAT).
function decodificar(png) {
  const bytes = Buffer.from(png);
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "firma PNG");
  assert.equal(String.fromCharCode(...bytes.subarray(12, 16)), "IHDR", "el primer chunk es IHDR");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8, "8 bits por canal");
  assert.equal(bytes[25], 6, "color type RGBA");
  assert.equal(bytes[26], 0, "compresión deflate");
  assert.equal(bytes[27], 0, "filtro adaptativo");
  assert.equal(bytes[28], 0, "sin entrelazado");

  const partes = [];
  let off = 8;
  const tipos = [];
  while (off < bytes.length) {
    const len = bytes.readUInt32BE(off);
    const tipo = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    tipos.push(tipo);
    if (tipo === "IDAT") partes.push(bytes.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  assert.deepEqual(tipos, ["IHDR", "IDAT", "IEND"], "chunks IHDR/IDAT/IEND");
  const raw = inflateSync(Buffer.concat(partes));
  assert.equal(raw.length, height * (1 + width * 4), "el inflating cuadra con el tamaño");
  const px = (x, y) => {
    const i = y * (1 + width * 4) + 1 + x * 4;
    return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
  };
  return { width, height, px, raw };
}

const FONDO = [0xf5, 0xf1, 0xe8, 0xff];
const BANDA_80 = [0xdc, 0xd4, 0xc4, 0xff];
const BANDA_50 = [0xb8, 0xae, 0x9a, 0xff];
const TINTA = [0x1b, 0x19, 0x16, 0xff];

// Serie de 30 cierres del dólar (la que usa el correo).
const serieDolar = Array.from({ length: 30 }, (_, i) => ({
  fecha: `2026-10-${String(i + 1).padStart(2, "0")}`,
  valor: i === 29 ? 3.43 : 3.4 + (i % 7) * 0.005,
}));

// Geometría del gráfico (la misma que usa el rasterizador).
function geometria({ width, height }, serie, bandas) {
  const valores = serie.map((p) => p.valor);
  for (const b of bandas) {
    for (const v of [b.p10, b.p90, b.p25, b.p75]) if (v != null && Number.isFinite(Number(v))) valores.push(Number(v));
  }
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || Math.max(Math.abs(max) * 0.01, 0.01);
  const vMin = min - rango * 0.08;
  const vMax = max + rango * 0.08;
  const pad = { left: 2, right: 2, top: 7, bottom: 9 };
  const anchoPlot = width - pad.left - pad.right;
  const altoPlot = height - pad.top - pad.bottom;
  const histX = Math.round(pad.left + anchoPlot * 0.7);
  const yBase = height - pad.bottom;
  const yDe = (v) => Math.round(yBase - ((v - vMin) / (vMax - vMin)) * altoPlot);
  return { vMin, vMax, histX, yDe };
}

test("encodePng: PNG de 8 bits RGBA que se puede descomprimir", () => {
  const rgba = new Uint8Array(4 * 4 * 4).fill(255);
  rgba[0] = 0x1b; rgba[1] = 0x19; rgba[2] = 0x16; rgba[3] = 0xff;
  const png = encodePng(4, 4, rgba);
  const { width, height, px } = decodificar(png);
  assert.equal(width, 4);
  assert.equal(height, 4);
  assert.deepEqual(px(0, 0), [0x1b, 0x19, 0x16, 0xff]);
  assert.deepEqual(px(3, 3), [0xff, 0xff, 0xff, 0xff]);
});

test("graficoRango: PNG con el tamaño pedido y datos descomprimibles", () => {
  const png = graficoRango({
    serie: serieDolar,
    bandas: [{ pasos: 6, p10: 3.4, p25: 3.42, p75: 3.44, p90: 3.46 }],
    ancho: 560,
    alto: 150,
  });
  const { width, height } = decodificar(png);
  assert.equal(width, 560);
  assert.equal(height, 150);
  assert.ok(png.length < 12 * 1024, `el PNG pesa ${png.length} bytes (objetivo < 12 KB)`);
});

test("graficoRango: el centro de la banda 80 % tiene su color y la esquina el fondo", () => {
  // Banda sin p25/p75: solo se dibuja el abanico del 80 %.
  const bandas = [{ pasos: 10, p10: 3.38, p90: 3.48 }];
  const png = graficoRango({ serie: serieDolar, bandas, ancho: 560, alto: 150 });
  const img = decodificar(png);
  const g = geometria(img, serieDolar, bandas);

  // Centro del abanico: a mitad de camino entre el último cierre y el borde.
  const ultimo = serieDolar[serieDolar.length - 1].valor;
  const x = Math.round(g.histX + (img.width - 2 - g.histX) / 2);
  const y = g.yDe(ultimo);
  assert.deepEqual(img.px(x, y), BANDA_80, "el centro de la banda 80 % es #DCD4C4");
  assert.deepEqual(img.px(0, 0), FONDO, "la esquina es el fondo #F5F1E8");
  assert.deepEqual(img.px(img.width - 1, 0), FONDO, "la otra esquina también es el fondo");
});

test("graficoRango: la banda central se dibuja encima de la amplia", () => {
  const bandas = [{ pasos: 10, p10: 3.38, p25: 3.41, p75: 3.45, p90: 3.48 }];
  const png = graficoRango({ serie: serieDolar, bandas, ancho: 560, alto: 150 });
  const img = decodificar(png);
  const g = geometria(img, serieDolar, bandas);
  const ultimo = serieDolar[serieDolar.length - 1].valor;
  const x = Math.round(g.histX + (img.width - 2 - g.histX) / 2);
  assert.deepEqual(img.px(x, g.yDe(ultimo)), BANDA_50, "el centro muestra la banda central #B8AE9A");
  assert.deepEqual(img.px(x, g.yDe(ultimo + 0.02)), BANDA_80, "fuera de la central se ve la banda 80 %");
  // La serie se dibuja en tinta.
  assert.deepEqual(img.px(g.histX, g.yDe(ultimo)), TINTA, "el último cierre lleva un punto de tinta");
});

test("graficoRango: sin bandas no falla y sale el fondo con la serie", () => {
  const png = graficoRango({ serie: serieDolar, bandas: [], ancho: 560, alto: 150 });
  const img = decodificar(png);
  const g = geometria(img, serieDolar, []);
  assert.deepEqual(img.px(0, 0), FONDO);
  assert.deepEqual(img.px(g.histX, g.yDe(serieDolar[serieDolar.length - 1].valor)), TINTA, "la serie sigue dibujada");
});

test("graficoRango: determinista (mismos datos → mismos bytes)", () => {
  const datos = { serie: serieDolar, bandas: [{ pasos: 6, p10: 3.4, p25: 3.42, p75: 3.44, p90: 3.46 }], ancho: 560, alto: 150 };
  const a = graficoRango(datos);
  const b = graficoRango(datos);
  assert.deepEqual(Array.from(a), Array.from(b));
});
