import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { canRead, decodeMasterKey, decryptEnvelope, encryptEnvelope, parseTokens, validateUpload } from "../src/security.js";

test("envelope roundtrip and tamper detection", () => {
  const master = randomBytes(32);
  const id = randomUUID();
  const original = Buffer.from("documento sensible de prueba");
  const encrypted = encryptEnvelope(original, master, id);
  const record = {
    id,
    encrypted_dek: encrypted.encryptedDek.toString("base64"),
    wrap_iv: encrypted.wrapIv.toString("base64"),
    payload_iv: encrypted.payloadIv.toString("base64"),
    content_sha256: encrypted.contentSha256,
  };
  assert.deepEqual(decryptEnvelope(record, encrypted.ciphertext, master), original);
  assert.deepEqual(decryptEnvelope({
    ...record,
    encrypted_dek: `\\x${encrypted.encryptedDek.toString("hex")}`,
    wrap_iv: `\\x${encrypted.wrapIv.toString("hex")}`,
    payload_iv: `\\x${encrypted.payloadIv.toString("hex")}`,
  }, encrypted.ciphertext, master), original);
  encrypted.ciphertext[0] ^= 1;
  assert.throws(() => decryptEnvelope(record, encrypted.ciphertext, master));
});

test("role policy is least privilege", () => {
  assert.equal(canRead("vegapunk", { document_type: "identidad" }), true);
  assert.equal(canRead("pythagoras", { document_type: "financiero" }), true);
  assert.equal(canRead("pythagoras", { document_type: "medico" }), false);
  assert.equal(canRead("lilith", { document_type: "financiero" }), false);
  assert.equal(canRead("shaka", { document_type: "financiero" }), false);
});

test("Lily can intake but cannot classify finance", () => {
  const common = {
    contact_id: randomUUID(), document_type: "consentimiento", mime_type: "application/pdf",
    purpose: "evidencia de consentimiento", content_base64: Buffer.from("%PDF-prueba").toString("base64"),
  };
  assert.ok(validateUpload(common, "lilith").data);
  assert.equal(validateUpload({ ...common, document_type: "financiero" }, "lilith").error, "role_denied");
  assert.equal(validateUpload({ ...common, document_type: "medico" }, "pythagoras").error, "role_denied");
  assert.equal(validateUpload({ ...common, mime_type: "image/png" }, "vegapunk").error, "content_type_mismatch");
});

test("secrets require exact length and assigned roles", () => {
  assert.equal(decodeMasterKey(randomBytes(32).toString("base64")).length, 32);
  assert.throws(() => decodeMasterKey("short"));
  assert.equal(parseTokens(JSON.stringify({ vegapunk: "v".repeat(32) })).get("v".repeat(32)), "vegapunk");
  assert.throws(() => parseTokens(JSON.stringify({ shaka: "s".repeat(32) })));
});
