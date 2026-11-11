import test from "node:test";
import assert from "node:assert/strict";
import { sunatNuevo } from "../worker.js";

test("sunatNuevo: SUNAT carries a date the workflow has not seen yet", () => {
  assert.equal(sunatNuevo("12/11/2026|3.415|3.421|", { sunat: "2026-11-11" }), true);
});

test("sunatNuevo: same date as the marker -> false", () => {
  assert.equal(sunatNuevo("11/11/2026|3.415|3.421|\n", { sunat: "2026-11-11" }), false);
});

test("sunatNuevo: empty marker object -> true", () => {
  assert.equal(sunatNuevo("11/11/2026|3.415|3.421|", {}), true);
});

test("sunatNuevo: null marker -> true", () => {
  assert.equal(sunatNuevo("11/11/2026|3.415|3.421|", null), true);
});

test("sunatNuevo: empty text -> false", () => {
  assert.equal(sunatNuevo("", { sunat: "2026-11-11" }), false);
});

test("sunatNuevo: text that is not SUNAT's -> false", () => {
  assert.equal(sunatNuevo("<html>error</html>", { sunat: "2026-11-11" }), false);
});
