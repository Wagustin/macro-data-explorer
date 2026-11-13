import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { puedeEnviarConfirmacion } from "../api/boletin.js";

test("una misma dirección recibe como máximo un correo cada 10 minutos", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-02T10:00:00Z") });
  try {
    const mail = "limite-10m@ejemplo.pe";
    assert.equal(await puedeEnviarConfirmacion(mail), true);
    assert.equal(await puedeEnviarConfirmacion(mail), false);
    mock.timers.tick(10 * 60 * 1000 + 1);
    assert.equal(await puedeEnviarConfirmacion(mail), true);
  } finally {
    mock.timers.reset();
  }
});

test("una dirección recibe como máximo tres correos al día", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-03T08:00:00Z") });
  try {
    const mail = "limite-dia@ejemplo.pe";
    assert.equal(await puedeEnviarConfirmacion(mail), true);
    mock.timers.tick(11 * 60 * 1000);
    assert.equal(await puedeEnviarConfirmacion(mail), true);
    mock.timers.tick(11 * 60 * 1000);
    assert.equal(await puedeEnviarConfirmacion(mail), true);
    mock.timers.tick(11 * 60 * 1000);
    assert.equal(await puedeEnviarConfirmacion(mail), false);
  } finally {
    mock.timers.reset();
  }
});

test("el límite es por dirección, no global", async () => {
  assert.equal(await puedeEnviarConfirmacion("otra-1@ejemplo.pe"), true);
  assert.equal(await puedeEnviarConfirmacion("otra-2@ejemplo.pe"), true);
});
