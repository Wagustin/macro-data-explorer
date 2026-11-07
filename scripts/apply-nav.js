#!/usr/bin/env node
// Adds the /boletin link right before the /precios link in the desktop nav
// (space-x-5) and the mobile menu (id="mobileMenu") of every root-level
// .html file and every empresa/*.html page.
//
// Idempotent: a nav that already contains href="/boletin" is left untouched.
// Files without the mobile menu marker are skipped and reported.
// Only the two header navs are touched; next/prev and in-content links are
// never modified.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DESKTOP_LINK = '<a href="/boletin" class="hover:text-ink transition no-underline">Boletín</a>';
const MOBILE_LINK = '<a href="/boletin" class="hover:text-ink py-1 transition no-underline">Boletín</a>';

function listHtmlFiles() {
  const files = [];
  for (const entry of readdirSync(root)) {
    if (entry.endsWith(".html")) files.push(join(root, entry));
  }
  const empresaDir = join(root, "empresa");
  for (const entry of readdirSync(empresaDir)) {
    if (entry.endsWith(".html")) files.push(join(empresaDir, entry));
  }
  return files.sort();
}

// Inserts `link` before the first `<a href="/precios"` inside the nav that
// starts at navStart. Multi-line navs put the new link on its own line with
// the anchor's indentation; single-line (minified) navs stay on one line.
// Returns { html, inserted, already, noAnchor }.
function insertInNav(html, navStart, link) {
  const closeIdx = html.indexOf("</nav>", navStart);
  if (closeIdx === -1) return { html, inserted: false, already: false, noAnchor: false, broken: true };
  const navEnd = closeIdx + "</nav>".length;
  const slice = html.slice(navStart, navEnd);
  if (slice.includes('href="/boletin"')) {
    return { html, inserted: false, already: true, noAnchor: false };
  }
  const anchorIdx = slice.indexOf('<a href="/precios"');
  if (anchorIdx === -1) {
    return { html, inserted: false, already: false, noAnchor: true };
  }
  const before = slice.slice(0, anchorIdx);
  const nl = before.lastIndexOf("\n");
  const sameLine = nl === -1 || /^[ 	]*$/.test(before.slice(nl + 1));
  const sep = sameLine ? "" : "\n" + before.slice(nl + 1);
  const newSlice = slice.slice(0, anchorIdx) + sep + link + slice.slice(anchorIdx);
  return { html: html.slice(0, navStart) + newSlice + html.slice(navEnd), inserted: true, already: false, noAnchor: false };
}

function processFile(path) {
  const rel = relative(root, path);
  const original = readFileSync(path, "utf8");
  let html = original;
  const notes = [];

  // Desktop nav: the <nav> whose class list contains space-x-5.
  const desktopOpen = /<nav\b[^>]*\bspace-x-5\b[^>]*>/.exec(html);
  if (desktopOpen) {
    const r = insertInNav(html, desktopOpen.index, DESKTOP_LINK);
    html = r.html;
    if (r.inserted) notes.push("desktop nav updated");
    else if (r.already) notes.push("desktop nav already has /boletin");
    else if (r.noAnchor) notes.push("desktop nav has no /precios link");
  } else {
    notes.push("no desktop (space-x-5) nav found");
  }

  // Mobile menu: the <nav> inside the #mobileMenu drawer.
  const menuIdx = html.indexOf('id="mobileMenu"');
  if (menuIdx === -1) {
    return { rel, changed: false, skipped: true, notes: ["skipped: no mobile menu marker (id=\"mobileMenu\")"] };
  }
  const mobileOpen = /<nav\b[^>]*>/.exec(html.slice(menuIdx));
  if (mobileOpen) {
    const navStart = menuIdx + mobileOpen.index;
    const r = insertInNav(html, navStart, MOBILE_LINK);
    html = r.html;
    if (r.inserted) notes.push("mobile menu updated");
    else if (r.already) notes.push("mobile menu already has /boletin");
    else if (r.noAnchor) notes.push("mobile menu has no /precios link");
  } else {
    notes.push("mobile menu marker without <nav>");
  }

  const changed = html !== original;
  if (changed) writeFileSync(path, html);
  return { rel, changed, skipped: false, notes };
}

const results = listHtmlFiles().map(processFile);
const changed = results.filter((r) => r.changed);
const skipped = results.filter((r) => r.skipped);
const untouched = results.filter((r) => !r.changed && !r.skipped);

for (const r of changed) console.log(`updated  ${r.rel} (${r.notes.join("; ")})`);
for (const r of untouched) console.log(`same     ${r.rel} (${r.notes.join("; ")})`);
for (const r of skipped) console.log(`skipped  ${r.rel} (${r.notes.join("; ")})`);

console.log(`\n${changed.length} file(s) changed, ${untouched.length} already up to date, ${skipped.length} skipped, ${results.length} total.`);
