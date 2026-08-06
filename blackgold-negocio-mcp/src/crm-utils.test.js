import test from "node:test";
import assert from "node:assert/strict";
import {
  esActorCrmValido,
  esClubCrmPermitido,
  esFechaISO,
  parsearClubesCrmPermitidos,
  tieneActualizacionPreferencias,
} from "./crm-utils.js";

test("el actor CRM se limita a un identificador operativo", () => {
  assert.equal(esActorCrmValido("lily"), true);
  assert.equal(esActorCrmValido("vegapunk_direccion"), true);
  assert.equal(esActorCrmValido("Lily de Black Gold"), false);
  assert.equal(esActorCrmValido("a"), false);
});

test("la actualización de preferencias requiere al menos un campo", () => {
  assert.equal(tieneActualizacionPreferencias({}), false);
  assert.equal(tieneActualizacionPreferencias({ canal_preferido: undefined }), false);
  assert.equal(tieneActualizacionPreferencias({ estilo_mensaje_preferido: "breve" }), true);
});

test("las fechas de reportes usan formato ISO sin aceptar texto ambiguo", () => {
  assert.equal(esFechaISO("2026-08-04"), true);
  assert.equal(esFechaISO("2026-02-30"), false);
  assert.equal(esFechaISO("04/08/2026"), false);
  assert.equal(esFechaISO("2026-8-4"), false);
});

test("los clubes CRM permitidos se configuran explícitamente y con coincidencia exacta", () => {
  const clubes = parsearClubesCrmPermitidos(" Black Gold, Club Norte,Black Gold, ");

  assert.deepEqual(clubes, ["Black Gold", "Club Norte"]);
  assert.equal(esClubCrmPermitido("Black Gold", clubes), true);
  assert.equal(esClubCrmPermitido("Club Norte", new Set(clubes)), true);
  assert.equal(esClubCrmPermitido("black gold", clubes), false);
  assert.equal(esClubCrmPermitido("Club Sur", clubes), false);
  assert.deepEqual(parsearClubesCrmPermitidos("  "), []);
  assert.deepEqual(parsearClubesCrmPermitidos(undefined), []);
});
