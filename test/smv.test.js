import test from "node:test";
import assert from "node:assert/strict";
import { markMonthEnds } from "../api/_lib/smv.js";

test("markMonthEnds marks the last trading day, including the current month", () => {
  const rows = [
    { fecha: "2026-08-28" }, { fecha: "2026-08-31" },
    { fecha: "2026-09-29" }, { fecha: "2026-09-30" },
    { fecha: "2026-10-26" }, { fecha: "2026-10-27" },
  ];
  assert.equal(markMonthEnds(rows), rows);
  assert.deepEqual(rows.map((row) => row.fin_de_mes), [false, true, false, true, false, true]);
});
