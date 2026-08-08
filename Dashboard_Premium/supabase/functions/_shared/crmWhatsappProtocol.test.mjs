import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  allowlistInternaDesdeJson,
  contenidoParaLily,
  codigoVinculoAppWhatsApp,
  esSolicitudNoContactar,
  firmaMetaValida,
  hmacSha256Hex,
  interesProbable,
  leerMensajes,
  normalizarWhatsApp,
  rolInternoParaIdentificador,
} from "./crmWhatsappProtocol.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test("verifica una firma HMAC de Meta y rechaza alteraciones", async () => {
  const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}');
  const firma = await hmacSha256Hex("secreto-prueba", body);
  assert.equal(await firmaMetaValida(body, `sha256=${firma}`, "secreto-prueba"), true);
  assert.equal(await firmaMetaValida(body, `sha256=${firma}`, "otro-secreto"), false);
  assert.equal(await firmaMetaValida(body, "sha256=invalida", "secreto-prueba"), false);
});

test("normaliza E.164 y no acepta identificadores ambiguos", () => {
  assert.equal(normalizarWhatsApp("593 99-123-4567"), "+593991234567");
  assert.equal(normalizarWhatsApp("00001234"), null);
  assert.equal(normalizarWhatsApp(undefined), null);
});

test("la allowlist interna exige exactamente los tres roles sin exponer números", () => {
  const allowlist = allowlistInternaDesdeJson(JSON.stringify([
    { e164: "+593991234567", rol: "ceo" },
    { e164: "+593981234567", rol: "direccion" },
    { e164: "+593971234567", rol: "marketing" },
  ]));
  assert.ok(allowlist instanceof Map);
  assert.equal(rolInternoParaIdentificador(allowlist, "593 99 123 4567"), "ceo");
  assert.equal(rolInternoParaIdentificador(allowlist, "+593961234567"), null);
  assert.equal(allowlistInternaDesdeJson('[{"e164":"+593991234567","rol":"ceo"}]'), null);
  assert.equal(allowlistInternaDesdeJson('[{"e164":"+593991234567","rol":"ceo"},{"e164":"+593991234567","rol":"direccion"},{"e164":"+593971234567","rol":"marketing"}]'), null);
});

test("solo pasa texto seguro a Lily y marca adjuntos para atención humana", () => {
  assert.deepEqual(contenidoParaLily({ type: "text", text: { body: " Hola\u0000 Lily " } }), {
    tipo: "text", contenido: "Hola  Lily",
  });
  assert.deepEqual(contenidoParaLily({ type: "location" }), {
    tipo: "location", contenido: "[Contenido location recibido: requiere atención humana.]",
  });
  assert.equal(interesProbable("¿Qué horarios tienen para las clases?"), "horarios");
});

test("identifica solo solicitudes explícitas de no contactar", () => {
  assert.equal(esSolicitudNoContactar("STOP"), true);
  assert.equal(esSolicitudNoContactar("Por favor, no me escriban más"), true);
  assert.equal(esSolicitudNoContactar("Quiero darme de baja"), true);
  assert.equal(esSolicitudNoContactar("No quiero una prueba ahora"), false);
  assert.equal(esSolicitudNoContactar("¿Cómo cancelo una clase?"), false);
});

test("solo reconoce el comando completo de vínculo emitido por la app", () => {
  assert.equal(codigoVinculoAppWhatsApp("VINCULAR BGV-ABCDEFGHJK"), "BGV-ABCDEFGHJK");
  assert.equal(codigoVinculoAppWhatsApp(" vincular bgv-23456789ab "), "BGV-23456789AB");
  assert.equal(codigoVinculoAppWhatsApp("¿Cómo vincular WhatsApp?"), null);
  assert.equal(codigoVinculoAppWhatsApp("VINCULAR BGV-ABCDEFGHJI"), null);
});

test("extrae mensajes pero ignora cambios de estado sin mensajes", () => {
  const mensajes = leerMensajes({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: "593991234567", profile: { name: "Ana" } }],
      messages: [{ id: "wamid.1", from: "593991234567", type: "text", text: { body: "Hola" } }],
    } }, { value: { statuses: [{ id: "wamid.1" }] } }] }],
  });
  assert.equal(mensajes.length, 1);
  assert.equal(mensajes[0].profileName, "Ana");
  assert.equal(mensajes[0].message.id, "wamid.1");
});
