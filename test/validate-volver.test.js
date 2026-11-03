import test from "node:test";
import assert from "node:assert/strict";

await import("../entrar.js");
const validateVolver = globalThis.validateVolver;

test("validateVolver accepts safe internal paths", () => {
  assert.equal(validateVolver("/explorer"), "/explorer");
  assert.equal(validateVolver("/empresas?ticker=BAP"), "/empresas?ticker=BAP");
  assert.equal(validateVolver("/precios#anual"), "/precios#anual");
  assert.equal(validateVolver("/noticias"), "/noticias");
});

test("validateVolver rejects empty or non-string inputs", () => {
  assert.equal(validateVolver(""), "/");
  assert.equal(validateVolver(null), "/");
  assert.equal(validateVolver(undefined), "/");
  assert.equal(validateVolver(123), "/");
  assert.equal(validateVolver({}), "/");
});

test("validateVolver rejects external protocols and relative slashes", () => {
  assert.equal(validateVolver("https://malicioso.com"), "/");
  assert.equal(validateVolver("http://malicioso.com"), "/");
  assert.equal(validateVolver("javascript:alert(1)"), "/");
  assert.equal(validateVolver("//evil.com"), "/");
  assert.equal(validateVolver("//attacker.site/foo"), "/");
});

test("validateVolver rejects control characters and spaces before any check", () => {
  assert.equal(validateVolver("/\t/evil.com"), "/");
  assert.equal(validateVolver("/\n/evil.com"), "/");
  assert.equal(validateVolver("/\r/evil.com"), "/");
  assert.equal(validateVolver("/ /evil.com"), "/");
  assert.equal(validateVolver(" /explorer"), "/");
  assert.equal(validateVolver("/explorer "), "/");
  assert.equal(validateVolver("/foo bar"), "/");
  assert.equal(validateVolver("/\x00/evil.com"), "/");
  assert.equal(validateVolver("/\x1f/evil.com"), "/");
  assert.equal(validateVolver("/\x7f/evil.com"), "/");
});

test("validateVolver rejects backslashes and colons", () => {
  assert.equal(validateVolver("/\\evil.com"), "/");
  assert.equal(validateVolver("/\\t/evil.com"), "/");
  assert.equal(validateVolver("/test:path"), "/");
  assert.equal(validateVolver("/foo/bar:baz"), "/");
});

test("validateVolver rejects encoded slashes and backslashes (/%2f, /%5c, uppercase and lowercase)", () => {
  assert.equal(validateVolver("/%2fevil.com"), "/");
  assert.equal(validateVolver("/%2Fevil.com"), "/");
  assert.equal(validateVolver("/%5cevil.com"), "/");
  assert.equal(validateVolver("/%5Cevil.com"), "/");
  assert.equal(validateVolver("/sub/%2fpath"), "/");
  assert.equal(validateVolver("/sub/%5cpath"), "/");
});

test("validateVolver decodes once and repeats checks on decoded output", () => {
  // Encoded tab (%09) or newline (%0A)
  assert.equal(validateVolver("/%09/evil.com"), "/");
  assert.equal(validateVolver("/%0a/evil.com"), "/");
  assert.equal(validateVolver("/%0d/evil.com"), "/");
  assert.equal(validateVolver("/%20/evil.com"), "/");
  assert.equal(validateVolver("/%00/evil.com"), "/");
  // Malformed percent-encoding should safely return '/'
  assert.equal(validateVolver("/%E0%A4%A"), "/");
  assert.equal(validateVolver("/%"), "/");
});
