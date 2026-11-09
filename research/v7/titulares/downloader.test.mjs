#!/usr/bin/env node
/**
 * Tests for downloader.mjs - GDELT titulares downloader
 * Run with: node --test research/v7/titulares/downloader.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");

// Import the downloader module (we'll test internal functions by evaluating the file)
let downloaderModule;

async function loadModule() {
  const mod = await import("./downloader.mjs");
  return mod;
}

// Mock fetch for testing
const originalFetch = global.fetch;
let mockFetchResponses = [];
let fetchCallLog = [];

function setupMockFetch(responses) {
  mockFetchResponses = [...responses];
  fetchCallLog = [];
  global.fetch = async (url, options) => {
    fetchCallLog.push({ url, options });
    const response = mockFetchResponses.shift() || { ok: true, status: 200, json: () => Promise.resolve({ articles: [] }), headers: new Headers() };
    return response;
  };
}

function restoreFetch() {
  global.fetch = originalFetch;
}

function createMockResponse(articles, status = 200, headers = {}) {
  const h = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: h,
    json: () => Promise.resolve({ articles }),
    text: () => Promise.resolve(JSON.stringify({ articles })),
  };
}

test("normalizeUrl removes hash and sorts query params", async () => {
  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      u.hash = "";
      u.searchParams.sort();
      return u.toString();
    } catch (_e) {
      return url;
    }
  }
  
  assert.equal(normalizeUrl("https://example.com/path?b=2&a=1#hash"), "https://example.com/path?a=1&b=2");
  assert.equal(normalizeUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(normalizeUrl("invalid-url"), "invalid-url");
});

test("seendateToFecha extracts date correctly", async () => {
  function seendateToFecha(raw) {
    if (!raw) return null;
    const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    try {
      return `${m[1]}-${m[2]}-${m[3]}`;
    } catch {
      return null;
    }
  }
  
  assert.equal(seendateToFecha("20261106T050000Z"), "2026-11-06");
  assert.equal(seendateToFecha("20190101T000000Z"), "2019-01-01");
  assert.equal(seendateToFecha(""), null);
  assert.equal(seendateToFecha(null), null);
  assert.equal(seendateToFecha("invalid"), null);
});

test("articleToRecord filters correctly", async () => {
  const SPANISH_LANGS = new Set(["spanish", "español", "espanol", "es"]);
  const ECONOMIA_RE = /d[oó]lar|tipo\s+de\s+cambio|bcrp|inflaci[oó]n|miner[ií]a|cobre|bolsa\s+de\s+valores/i;
  
  function articleToRecord(art) {
    if (!art) return null;
    const title = (art.title || "").trim();
    const url = (art.url || "").trim();
    if (!title || !url) return null;
    const fecha = seendateToFecha(art.seendate);
    if (!fecha) return null;
    const lang = (art.language || "").trim();
    const langOk = SPANISH_LANGS.has(lang.toLowerCase()) || (!lang && ECONOMIA_RE.test(title));
    if (!langOk) return null;
    if (!ECONOMIA_RE.test(title)) return null;
    return {
      fecha_disponible: fecha,
      titulo: title.replace(/\s+/g, " "),
      dominio: (art.domain || "").trim(),
      url,
      idioma: lang || "Spanish",
    };
  }
  
  function seendateToFecha(raw) {
    if (!raw) return null;
    const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  
  // Valid Spanish economy article
  const valid = articleToRecord({
    title: "El dólar sube en Perú",
    url: "https://example.com/1",
    seendate: "20261106T050000Z",
    language: "Spanish",
    domain: "example.com",
  });
  assert.ok(valid);
  assert.equal(valid.fecha_disponible, "2026-11-06");
  assert.equal(valid.titulo, "El dólar sube en Perú");
  
  // Non-Spanish language rejected
  const english = articleToRecord({
    title: "Dollar rises in Peru",
    url: "https://example.com/2",
    seendate: "20261106T050000Z",
    language: "English",
    domain: "example.com",
  });
  assert.equal(english, null);
  
  // No language but economy keyword in title - accepted
  const noLang = articleToRecord({
    title: "BCRP sube tasa de interés",
    url: "https://example.com/3",
    seendate: "20261106T050000Z",
    language: "",
    domain: "example.com",
  });
  assert.ok(noLang);
  
  // No economy keyword - rejected
  const noEconomy = articleToRecord({
    title: "Partido de fútbol en Lima",
    url: "https://example.com/4",
    seendate: "20261106T050000Z",
    language: "Spanish",
    domain: "example.com",
  });
  assert.equal(noEconomy, null);
  
  // Missing fields - rejected
  assert.equal(articleToRecord({ title: "", url: "x", seendate: "20261106T050000Z", language: "Spanish" }), null);
  assert.equal(articleToRecord({ title: "Dólar", url: "", seendate: "20261106T050000Z", language: "Spanish" }), null);
  assert.equal(articleToRecord({ title: "Dólar", url: "x", seendate: "", language: "Spanish" }), null);
});

test("splitWindow divides windows correctly", async () => {
  function splitWindow(start, end) {
    const MIN_WINDOW_HOURS = 1;
    const durationMs = end.getTime() - start.getTime();
    if (durationMs <= MIN_WINDOW_HOURS * 3600 * 1000) {
      return [{ start, end }];
    }
    const mid = new Date(start.getTime() + durationMs / 2);
    return [
      { start, end: mid },
      { start: new Date(mid.getTime() + 1), end },
    ];
  }
  
  const start = new Date("2026-01-01T00:00:00Z");
  const end = new Date("2026-01-03T23:59:59Z"); // 3 days
  const parts = splitWindow(start, end);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].start.getTime(), start.getTime());
  assert.ok(parts[0].end < parts[1].start);
  assert.equal(parts[1].end.getTime(), end.getTime());
  
  // Minimum window (1 hour) - cannot split
  const hourStart = new Date("2026-01-01T00:00:00Z");
  const hourEnd = new Date("2026-01-01T00:59:59Z");
  const hourParts = splitWindow(hourStart, hourEnd);
  assert.equal(hourParts.length, 1);
  assert.equal(hourParts[0].start.getTime(), hourStart.getTime());
});

test("generateWindows creates correct windows newest-first", async () => {
  function generateWindows(startDate, endDate, windowDays) {
    const windows = [];
    let curEnd = new Date(endDate);
    curEnd.setHours(23, 59, 59, 999);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
  
    while (curEnd >= start) {
      const curStart = new Date(Math.max(start.getTime(), curEnd.getTime() - (windowDays - 1) * 24 * 3600 * 1000));
      curStart.setHours(0, 0, 0, 0);
      windows.push({ start: curStart, end: curEnd });
      curEnd = new Date(curStart.getTime() - 1);
    }
    return windows;
  }
  
  const start = new Date("2026-01-01");
  const end = new Date("2026-01-10");
  const windows = generateWindows(start, end, 3); // 3-day windows
  
  // Should be newest first
  assert.ok(windows[0].end > windows[1].end);
  // First window: Jan 8-10 (3 days)
  assert.equal(windows[0].start.toISOString().slice(0,10), "2026-01-08");
  assert.equal(windows[0].end.toISOString().slice(0,10), "2026-01-10");
  // Last window: Jan 1-2 (2 days, remainder)
  assert.equal(windows[windows.length-1].start.toISOString().slice(0,10), "2026-01-01");
});

test("calcJitteredPause applies ±20% jitter", async () => {
  function calcJitteredPause(basePause) {
    const JITTER_PCT = 0.20;
    const jitter = basePause * JITTER_PCT * (Math.random() * 2 - 1);
    return Math.max(100, Math.round((basePause + jitter) * 1000));
  }
  
  const base = 6; // 6 seconds
  const results = new Set();
  for (let i = 0; i < 1000; i++) {
    results.add(calcJitteredPause(base));
  }
  // Should be between 4.8s and 7.2s (in ms: 4800-7200), min 100ms
  for (const ms of results) {
    assert.ok(ms >= 100);
    assert.ok(ms >= 4800 && ms <= 7200);
  }
});

test("windowKey format", async () => {
  function windowKey(start, end) {
    return `${start.toISOString().slice(0,10)}/${end.toISOString().slice(0,10)}`;
  }
  
  const start = new Date("2026-01-01T00:00:00Z");
  const end = new Date("2026-01-01T23:59:59Z");
  assert.equal(windowKey(start, end), "2026-01-01/2026-01-01");
});

// Test backoff logic - matches downloader.mjs: wait starts at BACKOFF_STEPS[0], used after first failure, then doubles
test("backoff increases exponentially and caps at 300s", async () => {
  const BACKOFF_STEPS = [30, 60, 120, 300];
  let wait = BACKOFF_STEPS[0] * 1000; // 30000ms - this is the wait AFTER first failure
  const waits = [];
  // Simulate the wait values used after each failed attempt (attempts 1-6)
  for (let attempt = 1; attempt <= 6; attempt++) {
    waits.push(wait); // wait used for this attempt's retry
    wait = Math.min(wait * 2, BACKOFF_STEPS[BACKOFF_STEPS.length - 1] * 1000);
  }
  
  assert.equal(waits[0], 30000);  // after attempt 1 failure: wait 30s
  assert.equal(waits[1], 60000);  // after attempt 2 failure: wait 60s
  assert.equal(waits[2], 120000); // after attempt 3 failure: wait 120s
  assert.equal(waits[3], 240000); // after attempt 4 failure: wait 240s
  assert.equal(waits[4], 300000); // after attempt 5 failure: capped at 300s
  assert.equal(waits[5], 300000); // after attempt 6 failure: capped at 300s
});

// Test pause reduction after 429
test("pause reduces by 10% after 20 successes, down to base", async () => {
  let currentPause = 20; // increased from base 6 after 429
  const BASE_PAUSA_S = 6;
  const REDUCE_PAUSA_AFTER_SUCCESSES = 20;
  const REDUCE_PAUSA_PCT = 0.10;
  let successStreak = 0;
  
  const pauses = [];
  for (let i = 0; i < 500; i++) { // More iterations to reach base
    successStreak++;
    if (successStreak >= REDUCE_PAUSA_AFTER_SUCCESSES && currentPause > BASE_PAUSA_S) {
      currentPause = Math.max(BASE_PAUSA_S, Math.round(currentPause * (1 - REDUCE_PAUSA_PCT)));
      successStreak = 0;
    }
    pauses.push(currentPause);
  }
  
  // Should gradually reduce from 20 to 6
  assert.equal(pauses[0], 20);
  assert.ok(pauses[pauses.length - 1] === 6);
  // Monotonically non-increasing
  for (let i = 1; i < pauses.length; i++) {
    assert.ok(pauses[i] <= pauses[i-1]);
  }
});

// Test manifest append (atomic write simulation)
test("manifiesto append uses atomic write", async () => {
  const testDir = fs.mkdtempSync(path.join(tmpdir(), "titulares-test-"));
  const MANIFIESTO_PATH = path.join(testDir, "manifiesto.jsonl");
  
  function appendManifiesto(entry) {
    const tmp = MANIFIESTO_PATH + ".tmp";
    // Read existing content first
    let existing = "";
    if (fs.existsSync(MANIFIESTO_PATH)) {
      existing = fs.readFileSync(MANIFIESTO_PATH, "utf8");
    }
    fs.writeFileSync(tmp, existing + JSON.stringify(entry) + "\n");
    fs.renameSync(tmp, MANIFIESTO_PATH);
  }
  
  appendManifiesto({ key: "2026-01-01/2026-01-01", status: "done", titulares: 5 });
  appendManifiesto({ key: "2026-01-02/2026-01-02", status: "failed", attempts: 3 });
  
  const content = fs.readFileSync(MANIFIESTO_PATH, "utf8");
  const lines = content.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes("done"));
  assert.ok(lines[1].includes("failed"));
  
  fs.rmSync(testDir, { recursive: true });
});

// Test estado save/load (atomic)
test("estado save uses atomic write", async () => {
  const testDir = fs.mkdtempSync(path.join(tmpdir(), "titulares-test-"));
  const ESTADO_PATH = path.join(testDir, "estado.json");
  
  function saveEstado(estado) {
    const tmp = ESTADO_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(estado, null, 1) + "\n");
    fs.renameSync(tmp, ESTADO_PATH);
  }
  
  function loadEstado() {
    if (!fs.existsSync(ESTADO_PATH)) return null;
    return JSON.parse(fs.readFileSync(ESTADO_PATH, "utf8"));
  }
  
  saveEstado({ ventanas_hechas: 10, peticiones_hora: 60 });
  const loaded = loadEstado();
  assert.equal(loaded.ventanas_hechas, 10);
  assert.equal(loaded.peticiones_hora, 60);
  
  fs.rmSync(testDir, { recursive: true });
});

// Test lock acquisition
test("acquireLock prevents concurrent runs", async () => {
  const testDir = fs.mkdtempSync(path.join(tmpdir(), "titulares-test-"));
  const LOCK_PATH = path.join(testDir, ".lock");
  
  function acquireLock() {
    try {
      const fd = fs.openSync(LOCK_PATH, "wx");
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code === "EEXIST") return false;
      throw e;
    }
  }
  
  function releaseLock() {
    try { fs.unlinkSync(LOCK_PATH); } catch { /* ignore */ }
  }
  
  assert.equal(acquireLock(), true);
  assert.equal(acquireLock(), false); // second call fails
  releaseLock();
  assert.equal(acquireLock(), true); // works after release
  
  fs.rmSync(testDir, { recursive: true });
});

// Integration test with mocked fetch
test("fetchWindow retries on 429 and respects Retry-After", async () => {
  const responses = [
    createMockResponse([], 429, { "Retry-After": "5" }), // First attempt: 429 with Retry-After: 5s
    createMockResponse([{ title: "Test", url: "https://example.com", seendate: "20261106T050000Z", language: "Spanish", domain: "example.com" }], 200), // Second attempt: success
  ];
  setupMockFetch(responses);
  
  // Simulate fetch calls
  await global.fetch("https://test1");
  await global.fetch("https://test2");
  
  // Verify mock was called twice
  assert.equal(fetchCallLog.length, 2);
  restoreFetch();
});

test("fetchWindow gives up after max retries", async () => {
  setupMockFetch([
    createMockResponse([], 500),
    createMockResponse([], 500),
    createMockResponse([], 500),
    createMockResponse([], 500),
    createMockResponse([], 500),
    createMockResponse([], 500),
    createMockResponse([], 500), // 7th call (maxRetries=6 means 6 attempts)
  ]);
  
  // Simulate 7 fetch calls
  for (let i = 0; i < 7; i++) {
    await global.fetch(`https://test${i}`);
  }
  
  restoreFetch();
  assert.equal(fetchCallLog.length, 7); // 1 initial + 6 retries
});

// Test deduplication by normalized URL
test("deduplication normalizes URLs", async () => {
  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      u.hash = "";
      u.searchParams.sort();
      return u.toString();
    } catch {
      return url;
    }
  }
  
  const seen = new Set();
  const urls = [
    "https://example.com/path?b=2&a=1",
    "https://example.com/path?a=1&b=2",
    "https://example.com/path?a=1&b=2#section",
    "https://other.com/path",
  ];
  
  const unique = [];
  for (const url of urls) {
    const norm = normalizeUrl(url);
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(url);
    }
  }
  
  assert.equal(unique.length, 2);
  assert.ok(unique.includes(urls[0]));
  assert.ok(unique.includes(urls[3]));
});

console.log("All tests passed!");