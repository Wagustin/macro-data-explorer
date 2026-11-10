// Rasterizador mínimo para los gráficos del correo: JavaScript puro, sin dependencias.
// Primitivas: rectángulos, polígonos (scanline), polilíneas con grosor y uniones redondeadas
// y círculos. Antialiasing por supermuestreo 3x3 (cobertura por subpíxel) y mezcla alfa
// sobre el fondo. Sin texto dentro de la imagen: todas las cifras y etiquetas van como
// texto HTML alrededor, para que se lean aunque el cliente bloquee las imágenes.

import { encodePng } from "./png.js";

// Subpíxeles por lado del raster: cada píxel final promedia SSxSS muestras.
// El mínimo es 3 (supermuestreo 3x); un valor mayor suaviza más los bordes.
const SS_MIN = 3;

// Convierte "#RRGGBB" (o "#RGB") a [r, g, b, a] con valores 0-255.
function color(hex, alfa = 255) {
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(String(hex || ""));
  if (!m) return [0, 0, 0, alfa];
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alfa];
}

// Mezcla alfa «source over» sobre un píxel opaco del lienzo.
function mezcla(buf, i, c, cobertura = 1) {
  const a = (c[3] / 255) * cobertura;
  if (a <= 0) return;
  buf[i] = Math.round(c[0] * a + buf[i] * (1 - a));
  buf[i + 1] = Math.round(c[1] * a + buf[i + 1] * (1 - a));
  buf[i + 2] = Math.round(c[2] * a + buf[i + 2] * (1 - a));
  buf[i + 3] = 255;
}

// Rectángulo relleno (coordenadas del raster).
function rellenarRect(buf, w, h, x0, y0, x1, y1, c) {
  const xs = Math.max(0, Math.floor(x0));
  const xe = Math.min(w, Math.ceil(x1));
  const ys = Math.max(0, Math.floor(y0));
  const ye = Math.min(h, Math.ceil(y1));
  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) mezcla(buf, (y * w + x) * 4, c, 1);
  }
}

// Polígono relleno por scanline, con cobertura horizontal parcial (coordenadas del raster).
function rellenarPoligono(buf, w, h, puntos, c) {
  if (!puntos || puntos.length < 6) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < puntos.length; i += 2) {
    if (puntos[i] < minY) minY = puntos[i];
    if (puntos[i] > maxY) maxY = puntos[i];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(h - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    const cruces = [];
    for (let i = 0; i < puntos.length; i += 2) {
      const ax = puntos[i], ay = puntos[i + 1];
      const j = (i + 2) % puntos.length;
      const bx = puntos[j], by = puntos[j + 1];
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
        cruces.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
    }
    if (cruces.length < 2) continue;
    cruces.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cruces.length; k += 2) {
      const xa = cruces[k];
      const xb = cruces[k + 1];
      const izq = Math.max(0, Math.floor(xa - 0.5));
      const der = Math.min(w - 1, Math.ceil(xb - 0.5));
      for (let x = izq; x <= der; x++) {
        const cobertura = Math.min(x + 0.5, xb) - Math.max(x - 0.5, xa);
        if (cobertura <= 0) continue;
        mezcla(buf, (y * w + x) * 4, c, Math.min(1, cobertura));
      }
    }
  }
}

// Círculo relleno con cobertura radial (coordenadas del raster).
function rellenarCirculo(buf, w, h, cx, cy, r, c) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const cobertura = Math.max(0, Math.min(1, r + 0.5 - d));
      if (cobertura <= 0) continue;
      mezcla(buf, (y * w + x) * 4, c, cobertura);
    }
  }
}

// Polilínea con grosor: segmento a segmento, con tapas y uniones redondeadas.
function trazarPolilinea(buf, w, h, puntos, grosor, c) {
  if (!puntos || puntos.length < 4) return;
  const r = grosor / 2;
  for (let i = 0; i + 3 < puntos.length; i += 2) {
    const ax = puntos[i], ay = puntos[i + 1];
    const bx = puntos[i + 2], by = puntos[i + 3];
    const dx = bx - ax;
    const dy = by - ay;
    const largo = Math.hypot(dx, dy);
    const pasos = Math.max(1, Math.ceil(largo));
    for (let s = 0; s <= pasos; s++) {
      const t = s / pasos;
      rellenarCirculo(buf, w, h, ax + dx * t, ay + dy * t, r, c);
    }
  }
}

// Promedia el raster SSxSS a un píxel final.
function reducir(src, rw, rh, w, h, ss) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        const fila = (y * ss + sy) * rw;
        for (let sx = 0; sx < ss; sx++) {
          const i = (fila + x * ss + sx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2];
        }
      }
      const n = ss * ss;
      const j = (y * w + x) * 4;
      out[j] = Math.round(r / n);
      out[j + 1] = Math.round(g / n);
      out[j + 2] = Math.round(b / n);
      out[j + 3] = 255;
    }
  }
  return out;
}

const FONDO = "#F5F1E8";
const TINTA = "#1B1916";
const BANDA_80 = "#DCD4C4";
const BANDA_50 = "#B8AE9A";
const LINEA_BASE = "#DCD4C4";

/**
 * Dibuja el gráfico de rango (serie histórica + abanico de proyección) y lo devuelve como PNG.
 * @param {Object} opts
 * @param {Array<{fecha: string, valor: number}>} opts.serie - cierres (30 para el dólar, 60 para una acción)
 * @param {Array<{pasos: number, p10: number, p25: number, p75: number, p90: number}>} opts.bandas - abanicos
 * @param {number} [opts.ancho=560] - ancho del PNG en píxeles
 * @param {number} [opts.alto=150] - alto del PNG en píxeles
 * @param {number} [opts.escala=2] - supermuestreo del raster (mínimo 3x3 muestras por píxel)
 * @returns {Uint8Array} bytes del PNG
 */
export function graficoRango({ serie, bandas, ancho = 560, alto = 150, escala = 2 }) {
  const w = Math.max(1, Math.round(ancho));
  const h = Math.max(1, Math.round(alto));
  const ss = Math.max(SS_MIN, Math.round(escala) || SS_MIN);
  const rw = w * ss;
  const rh = h * ss;

  const buf = new Uint8Array(rw * rh * 4);
  const fondo = color(FONDO);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = fondo[0]; buf[i + 1] = fondo[1]; buf[i + 2] = fondo[2]; buf[i + 3] = 255;
  }

  const datos = (Array.isArray(serie) ? serie : [])
    .map((p) => ({ fecha: p?.fecha, valor: Number(p?.valor) }))
    .filter((p) => Number.isFinite(p.valor));
  const cintas = (Array.isArray(bandas) ? bandas : [])
    .filter((b) => b && Number.isFinite(Number(b.p10)) && Number.isFinite(Number(b.p90)))
    .map((b) => ({
      pasos: Math.max(0, Number(b.pasos) || 0),
      p10: Number(b.p10), p90: Number(b.p90),
      p25: Number.isFinite(Number(b.p25)) ? Number(b.p25) : null,
      p75: Number.isFinite(Number(b.p75)) ? Number(b.p75) : null,
    }))
    .sort((a, b) => a.pasos - b.pasos);

  if (!datos.length) return encodePng(w, h, reducir(buf, rw, rh, w, h, ss));

  // Escala vertical: cubre serie y abanicos con 8 % de margen.
  let min = Infinity;
  let max = -Infinity;
  for (const p of datos) { if (p.valor < min) min = p.valor; if (p.valor > max) max = p.valor; }
  for (const b of cintas) {
    for (const v of [b.p10, b.p90, b.p25, b.p75]) {
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const rango = max - min || Math.max(Math.abs(max) * 0.01, 0.01);
  const vMin = min - rango * 0.08;
  const vMax = max + rango * 0.08;

  // Márgenes (lógicos) y área del gráfico.
  const pad = { left: 2, right: 2, top: 7, bottom: 9 };
  const anchoPlot = w - pad.left - pad.right;
  const altoPlot = h - pad.top - pad.bottom;
  const histX = Math.round(pad.left + anchoPlot * 0.7);
  const yBase = h - pad.bottom;

  const yDe = (v) => Math.round((yBase - ((v - vMin) / (vMax - vMin)) * altoPlot) * ss);
  const xDe = (x) => Math.round(x * ss);

  const ultimo = datos[datos.length - 1];
  const xUltimo = histX;
  const yUltimo = yDe(ultimo.valor);

  // Abanico: se abre desde el último valor hacia la derecha.
  if (cintas.length) {
    const maxPasos = Math.max(...cintas.map((b) => b.pasos), 1);
    const xDeBanda = (b) => xDe(histX + (b.pasos / maxPasos) * (pad.left + anchoPlot - histX));
    const poligono = (banda) => {
      const pts = [];
      for (const b of cintas) {
        if (banda === "p25" && (b.p25 == null || b.p75 == null)) continue;
        pts.push(xDeBanda(b), yDe(b[banda]));
      }
      if (!pts.length) return null;
      const cierre = [];
      for (let i = cintas.length - 1; i >= 0; i--) {
        const b = cintas[i];
        if (banda === "p25" && (b.p25 == null || b.p75 == null)) continue;
        cierre.push(xDeBanda(b), yDe(b[banda === "p25" ? "p75" : "p90"]));
      }
      return [xDe(xUltimo), yUltimo, ...pts, ...cierre, xDe(xUltimo), yUltimo];
    };
    const p80 = poligono("p10");
    if (p80) rellenarPoligono(buf, rw, rh, p80, color(BANDA_80));
    const p50 = poligono("p25");
    if (p50) rellenarPoligono(buf, rw, rh, p50, color(BANDA_50));
  }

  // Línea base fina.
  const grosorBase = Math.max(1, Math.round(1 * ss));
  rellenarRect(buf, rw, rh, xDe(pad.left), yDe(vMin) - grosorBase, xDe(pad.left + anchoPlot), yDe(vMin), color(LINEA_BASE));

  // Línea vertical punteada y tenue en el último cierre.
  const punteado = color(LINEA_BASE, 170);
  const largo = Math.round(3 * ss);
  const hueco = Math.round(3 * ss);
  for (let y = 0; y < rh; y += largo + hueco) {
    const fin = Math.min(rh, y + largo);
    for (let yy = y; yy < fin; yy++) mezcla(buf, (yy * rw + xDe(xUltimo)) * 4, punteado, 1);
  }

  // Línea de la serie (tinta) y punto en el último cierre.
  const puntos = datos.map((p, i) => {
    const x = datos.length === 1 ? histX : pad.left + (i / (datos.length - 1)) * (histX - pad.left);
    return [xDe(x), yDe(p.valor)];
  });
  const plano = [];
  for (const [x, y] of puntos) plano.push(x, y);
  trazarPolilinea(buf, rw, rh, plano, Math.max(1, 1.5 * ss), color(TINTA));
  rellenarCirculo(buf, rw, rh, xDe(xUltimo), yUltimo, Math.max(1, 2.5 * ss), color(TINTA));

  return encodePng(w, h, reducir(buf, rw, rh, w, h, ss));
}
