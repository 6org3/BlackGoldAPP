import assert from "node:assert/strict";
import test from "node:test";
import {
  allowlistInternaDesdeJson,
  esSolicitudNoContactar,
  interesProbable,
  leerVariablesDotenv,
  normalizarWhatsApp,
  referenciaEventoWhatsApp,
} from "../src/protocol.js";

test("normaliza E.164 sin aceptar texto libre", () => {
  assert.equal(normalizarWhatsApp("+593 99 123 4567"), "+593991234567");
  assert.equal(normalizarWhatsApp("hola"), null);
});

test("la allowlist exige los tres roles únicos", () => {
  const lista = allowlistInternaDesdeJson(JSON.stringify([
    { e164: "+593991111111", rol: "ceo" },
    { e164: "+593992222222", rol: "direccion" },
    { e164: "+593993333333", rol: "marketing" },
  ]));
  assert.equal(lista.get("+593992222222"), "direccion");
  assert.equal(allowlistInternaDesdeJson("[]"), null);
});

test("clasifica intención y solicitudes de no contactar de forma conservadora", () => {
  assert.equal(interesProbable("Quiero conocer los horarios"), "horarios");
  assert.equal(esSolicitudNoContactar("Por favor no me escriban más"), true);
  assert.equal(esSolicitudNoContactar("¿Cómo cancelo una clase?"), false);
});

test("la referencia no almacena el ID externo y es estable", () => {
  const primera = referenciaEventoWhatsApp("direccion", "mensaje-unico");
  assert.match(primera, /^ocwa_[a-f0-9]{64}$/);
  assert.equal(primera, referenciaEventoWhatsApp("direccion", "mensaje-unico"));
  assert.notEqual(primera, referenciaEventoWhatsApp("direccion", "otro-mensaje"));
});

test("lee sólo las variables solicitadas de dotenv", () => {
  const resultado = leerVariablesDotenv("SUPABASE_URL=http://127.0.0.1:8000\nSECRETO=ignorar\nCRM_INTERNAL_WHATSAPP_ALLOWLIST='[]'", ["SUPABASE_URL", "CRM_INTERNAL_WHATSAPP_ALLOWLIST"]);
  assert.deepEqual(resultado, { SUPABASE_URL: "http://127.0.0.1:8000", CRM_INTERNAL_WHATSAPP_ALLOWLIST: "[]" });
});
