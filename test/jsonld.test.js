import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldNoindex, isIndexableBody } from "../worker.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readHtml = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

function ldJsonBlocks(html) {
  return [
    ...html.matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((m) => m[1]);
}

function metaDescription(html) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (/\bname\s*=\s*["']description["']/i.test(tag)) {
      const m = tag.match(/\bcontent\s*=\s*"([^"]*)"/i);
      if (m) return m[1];
    }
  }
  return null;
}

const rootPages = fs
  .readdirSync(rootDir)
  .filter((f) => f.endsWith(".html"))
  .map((f) => ({ file: f, route: f === "index.html" ? "/" : `/${f.replace(/\.html$/, "")}` }));

const fichaFiles = fs
  .readdirSync(path.join(rootDir, "empresa"))
  .filter((f) => f.endsWith(".html"));

test("every JSON-LD block in root pages and fichas parses as valid JSON", () => {
  const all = [
    ...rootPages.map((p) => p.file),
    ...fichaFiles.map((f) => `empresa/${f}`),
  ];
  for (const rel of all) {
    const blocks = ldJsonBlocks(readHtml(rel));
    for (const raw of blocks) {
      assert.doesNotThrow(() => JSON.parse(raw), `${rel} has an invalid JSON-LD block`);
    }
  }
});

test("homepage carries Organization and WebSite JSON-LD", () => {
  const types = ldJsonBlocks(readHtml("index.html")).map((b) => JSON.parse(b)["@type"]);
  assert.ok(types.includes("Organization"), "index.html missing Organization");
  assert.ok(types.includes("WebSite"), "index.html missing WebSite");
});

test("/dolar carries FAQPage and Dataset JSON-LD with real content", () => {
  const blocks = ldJsonBlocks(readHtml("dolar.html")).map((b) => JSON.parse(b));

  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "dolar.html missing FAQPage");
  assert.ok(Array.isArray(faq.mainEntity) && faq.mainEntity.length >= 3, "FAQPage needs real questions");
  for (const q of faq.mainEntity) {
    assert.equal(q["@type"], "Question");
    assert.ok(q.name.length > 0, "question without name");
    assert.ok(q.acceptedAnswer?.["@type"] === "Answer" && q.acceptedAnswer.text.length > 0);
  }

  const dataset = blocks.find((b) => b["@type"] === "Dataset");
  assert.ok(dataset, "dolar.html missing Dataset");
  assert.ok(dataset.license?.["@type"] === "CreativeWork" && dataset.license?.url?.startsWith("https://"), "Dataset must declare its license as a CreativeWork object with an https url");
  assert.ok(
    dataset.distribution?.[0]?.contentUrl?.includes("estadisticas.bcrp.gob.pe"),
    "Dataset distribution must point at the official BCRP series API"
  );
});

test("every indexable ficha carries a BreadcrumbList", () => {
  let indexable = 0;
  for (const f of fichaFiles) {
    const html = readHtml(`empresa/${f}`);
    if (!isIndexableBody(html)) continue;
    indexable++;
    const types = ldJsonBlocks(html).map((b) => JSON.parse(b)["@type"]);
    assert.ok(types.includes("BreadcrumbList"), `empresa/${f} is indexable but has no BreadcrumbList`);
  }
  assert.ok(indexable > 0, "expected at least one indexable ficha");
});

test("indexable pages and fichas have a unique meta description of 140-160 chars", () => {
  const seen = new Map();
  const check = (label, html) => {
    const desc = metaDescription(html);
    assert.ok(desc, `${label} has no meta description`);
    assert.ok(
      desc.length >= 140 && desc.length <= 160,
      `${label} meta description length ${desc?.length} outside 140-160: ${desc}`
    );
    assert.ok(!seen.has(desc), `duplicate meta description on ${label} and ${seen.get(desc)}`);
    seen.set(desc, label);
  };

  for (const { file, route } of rootPages) {
    if (shouldNoindex(route) || shouldNoindex(`${route}.html`)) continue;
    check(file, readHtml(file));
  }
  for (const f of fichaFiles) {
    const html = readHtml(`empresa/${f}`);
    if (!isIndexableBody(html)) continue;
    check(`empresa/${f}`, html);
  }
});
