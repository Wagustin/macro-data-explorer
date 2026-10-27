import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pixelmatch = require("pixelmatch");
const { PNG } = require("pngjs");
const dimensionCheckedPages = new Set(["metodologia", "precios"]);
const [baselineDir, currentDir] = process.argv.slice(2);

if (!baselineDir || !currentDir) {
  console.error("Usage: node scripts/visual-diff.js <baseline-directory> <current-directory>");
  process.exit(2);
}

async function pngFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? pngFiles(fullPath) : entry.name.endsWith(".png") ? [fullPath] : [];
  }));
  return files.flat();
}

const baselineFiles = await pngFiles(baselineDir);
const currentFiles = await pngFiles(currentDir);
const baselineByName = new Map(baselineFiles.map((file) => [path.relative(baselineDir, file), file]));
const currentByName = new Map(currentFiles.map((file) => [path.relative(currentDir, file), file]));
const names = [...new Set([...baselineByName.keys(), ...currentByName.keys()])].sort();

if (!names.length) {
  console.error("No screenshots found to compare.");
  process.exit(1);
}

let failed = false;
for (const name of names) {
  const baselinePath = baselineByName.get(name);
  const currentPath = currentByName.get(name);
  if (!baselinePath || !currentPath) {
    console.log(`${name}: 100.00% (missing from ${baselinePath ? "current" : "baseline"})`);
    failed = true;
    continue;
  }

  const [baseline, current] = await Promise.all([
    fs.readFile(baselinePath).then((buffer) => PNG.sync.read(buffer)),
    fs.readFile(currentPath).then((buffer) => PNG.sync.read(buffer))
  ]);
  const pageName = name.split("-")[0];
  if (dimensionCheckedPages.has(pageName) && (baseline.width !== current.width || baseline.height !== current.height)) {
    console.log(`${name}: 100.00% (dimensions ${baseline.width}x${baseline.height} vs ${current.width}x${current.height})`);
    failed = true;
    continue;
  }

  const width = Math.min(baseline.width, current.width);
  const height = Math.min(baseline.height, current.height);
  const baselineCrop = baseline.width === width && baseline.height === height
    ? baseline.data
    : crop(baseline, width, height);
  const currentCrop = current.width === width && current.height === height
    ? current.data
    : crop(current, width, height);
  const differingPixels = pixelmatch(baselineCrop, currentCrop, null, width, height, { threshold: 0.1 });
  const percentage = (differingPixels / (width * height)) * 100;
  console.log(`${name}: ${percentage.toFixed(2)}%`);
  if (percentage > 2) failed = true;
}

if (failed) process.exitCode = 1;

function crop(image, width, height) {
  const cropped = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * image.width * 4;
    const targetStart = row * width * 4;
    image.data.copy(cropped, targetStart, sourceStart, sourceStart + width * 4);
  }
  return cropped;
}
