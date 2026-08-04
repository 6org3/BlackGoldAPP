import assert from "node:assert/strict";
import test from "node:test";
import {
  clasificarRechazoMeta,
  destinatarioWhatsApp,
  firmaIngresoLilyValida,
  hmacSha256Hex,
  sha256Hex,
  timestampFresco,
  validarSolicitudSalida,
} from "./protocol.mjs";

const SECRET = "prueba-solo-local";
const NOW = 1_750_000_000_000;
const TIMESTAMP = String(NOW / 1000);
const UUID = "11111111-1111-4111-8111-111111111111";

test("valida la firma HMAC sobre timestamp y cuerpo exacto", async () => {
  const body = '{"contact_id":"x"}';
  const raw = new TextEncoder().encode(body);
  const signature = await hmacSha256Hex(SECRET, `${TIMESTAMP}.${body}`);

  assert.equal(await firmaIngresoLilyValida(raw, TIMESTAMP, `sha256=${signature}`, SECRET, NOW), true);
  assert.equal(await firmaIngresoLilyValida(raw, TIMESTAMP, `sha256=${signature}`, "otro-secreto", NOW), false);
  assert.equal(await firmaIngresoLilyValida(raw, TIMESTAMP, "sha256=" + "0".repeat(64), SECRET, NOW), false);
});

test("rechaza timestamps vencidos y formatos ambiguos", () => {
  assert.equal(timestampFresco(TIMESTAMP, NOW), true);
  assert.equal(timestampFresco(String((NOW - 301_000) / 1000), NOW), false);
  assert.equal(timestampFresco(String((NOW + 31_000) / 1000), NOW), false);
  assert.equal(timestampFresco("1750000000000", NOW), false);
});

test("acepta solamente el contrato operativo de Lily", async () => {
  const request = {
    contact_id: UUID,
    mensaje: "Hola, tenemos disponible una prueba.",
    idempotency_key: "lily.2026-08-04.0001",
    intent: "seguimiento",
    modo: "respuesta",
    reply_to_message_ref: "wamid.HBgMNTkzMDAwMDAwMDAFAgARGBI",
  };
  const valid = validarSolicitudSalida(request);
  assert.deepEqual(valid, {
    data: {
      contactId: UUID,
      mensaje: "Hola, tenemos disponible una prueba.",
      idempotencyKey: "lily.2026-08-04.0001",
      intent: "seguimiento",
      modo: "respuesta",
      replyToMessageRef: "wamid.HBgMNTkzMDAwMDAwMDAFAgARGBI",
    },
  });

  assert.equal(validarSolicitudSalida({ ...request, modo: "marketing" }).error, "modo no es válido.");
  assert.equal(validarSolicitudSalida({ ...request, intent: "marketing" }).error, "intent no es válido.");
  assert.equal(validarSolicitudSalida({ ...request, modo: "seguimiento", intent: "horarios" }).error, "modo seguimiento requiere intent seguimiento.");
  assert.equal(validarSolicitudSalida({ ...request, reply_to_message_ref: null }).error, "reply_to_message_ref es obligatorio para una respuesta.");
  assert.equal(validarSolicitudSalida({ ...request, actor: "lily_ventas" }).error, "actor se asigna en el servidor.");
  assert.equal(await sha256Hex("payload"), "239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5");
  assert.equal(destinatarioWhatsApp("+593 99 123 4567"), "593991234567");
  assert.equal(destinatarioWhatsApp("texto"), null);
});

test("clasifica errores Meta sin conservar su cuerpo", () => {
  assert.deepEqual(clasificarRechazoMeta(400), {
    errorResumido: "meta_terminal_http_400",
    reintentable: false,
  });
  assert.deepEqual(clasificarRechazoMeta(429), {
    errorResumido: "meta_reintentable_http_429",
    reintentable: true,
  });
  assert.deepEqual(clasificarRechazoMeta(503), {
    errorResumido: "meta_reintentable_http_503",
    reintentable: true,
  });
  assert.deepEqual(clasificarRechazoMeta(0), {
    errorResumido: "meta_resultado_desconocido",
    reintentable: false,
  });
});
