import assert from "node:assert/strict";
import test from "node:test";
import {
  finDiaComercialISO,
  hoyComercialISO,
  inicioDiaComercialISO,
  sumarDiasCalendarioISO,
} from "./crm-report-time.js";

test("el reporte comercial conserva el dia de Ecuador despues de medianoche UTC", () => {
  const instante = new Date("2026-08-06T02:05:24.636Z");

  assert.equal(hoyComercialISO(instante), "2026-08-05");
  assert.equal(inicioDiaComercialISO("2026-08-05"), "2026-08-05T00:00:00.000-05:00");
  assert.equal(finDiaComercialISO("2026-08-05"), "2026-08-05T23:59:59.999-05:00");
});

test("el rango calendario no depende de la zona horaria del proceso", () => {
  assert.equal(sumarDiasCalendarioISO("2026-08-05", -30), "2026-07-06");
  assert.equal(sumarDiasCalendarioISO("2026-01-01", -1), "2025-12-31");
});
