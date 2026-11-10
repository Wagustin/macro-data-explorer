// Codificador PNG mínimo, sin dependencias: solo node:zlib.
// encodePng(width, height, rgba) -> Uint8Array (PNG de 8 bits RGBA, filtro 0 por fila).

import { deflateSync } from "node:zlib";

// Tabla CRC32 (polinomio estándar 0xEDB88320)
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf, offset, length) {
  let crc = 0xFFFFFFFF;
  for (let i = offset; i < offset + length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeUint32(arr, offset, val) {
  arr[offset] = (val >>> 24) & 0xFF;
  arr[offset + 1] = (val >>> 16) & 0xFF;
  arr[offset + 2] = (val >>> 8) & 0xFF;
  arr[offset + 3] = val & 0xFF;
}

function chunk(type, data) {
  const len = data.length;
  const out = new Uint8Array(len + 12);
  writeUint32(out, 0, len);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  writeUint32(out, 8 + len, crc32(out, 4, len + 4));
  return out;
}

/**
 * Codifica un mapa de bits RGBA como PNG.
 * @param {number} width - ancho en píxeles
 * @param {number} height - alto en píxeles
 * @param {Uint8Array} rgba - buffer RGBA plano, length = width * height * 4
 * @returns {Uint8Array} bytes del archivo PNG
 */
export function encodePng(width, height, rgba) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`tamaño inválido: ${width}x${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`rgba length mismatch: expected ${width * height * 4}, got ${rgba.length}`);
  }

  // Líneas de barrido con byte de filtro 0 (None)
  const stride = width * 4;
  const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    scanlines[y * (stride + 1)] = 0;
    scanlines.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const compressed = deflateSync(scanlines);

  const sig = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = 8;    // profundidad de bits
  ihdr[9] = 6;    // color type: truecolor con alfa
  ihdr[10] = 0;   // método de compresión
  ihdr[11] = 0;   // método de filtro
  ihdr[12] = 0;   // sin entrelazado

  const ihdrChunk = chunk("IHDR", ihdr);
  const idat = chunk("IDAT", compressed);
  const iend = chunk("IEND", new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdrChunk.length + idat.length + iend.length);
  let pos = 0;
  out.set(sig, pos); pos += sig.length;
  out.set(ihdrChunk, pos); pos += ihdrChunk.length;
  out.set(idat, pos); pos += idat.length;
  out.set(iend, pos);
  return out;
}
