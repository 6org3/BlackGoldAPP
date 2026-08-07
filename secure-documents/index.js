import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { canRead, decodeMasterKey, decryptEnvelope, encryptEnvelope, parseTokens, validateUpload } from "./src/security.js";
import { createSupabaseStore } from "./src/supabase.js";

const MAX_BODY = 14 * 1024 * 1024;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
};
const tokens = parseTokens(required("SECURE_RECORDS_TOKENS_JSON"));
const masterKey = decodeMasterKey(required("BLACKGOLD_SECURE_MASTER_KEY_B64"));
const store = createSupabaseStore(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));
const host = process.env.SECURE_RECORDS_HOST ?? "127.0.0.1";
const port = Number(process.env.SECURE_RECORDS_PORT ?? "8096");

function actorFor(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? tokens.get(header.slice(7)) ?? null : null;
}
function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": payload.length, "Cache-Control": "no-store" });
  res.end(payload);
}
async function bodyJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function audit(documentId, actor, purpose, action, allowed, result) {
  try { await store.audit({ secure_document_id: UUID_RE.test(documentId ?? "") ? documentId : null, actor, purpose, action, allowed, result }); }
  catch { console.error("[secure-documents] audit_failed"); }
}
async function auditRequired(documentId, actor, purpose, action, result) {
  await store.audit({ secure_document_id: documentId, actor, purpose, action, allowed: true, result });
}

const server = createServer(async (req, res) => {
  const actor = actorFor(req);
  if (!actor) return json(res, 401, { error: "unauthorized" });
  const url = new URL(req.url, `http://${host}:${port}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

    if (req.method === "POST" && url.pathname === "/v1/documents") {
      const body = await bodyJson(req);
      const parsed = validateUpload(body, actor);
      if (parsed.error) {
        await audit(null, actor, body?.purpose ?? "invalid request", "create", false, "denied");
        return json(res, 403, { error: parsed.error });
      }
      const id = randomUUID();
      const objectKey = `${id}.bin`;
      const envelope = encryptEnvelope(parsed.data.content, masterKey, id);
      await store.uploadObject(objectKey, envelope.ciphertext);
      let record = null;
      try {
        record = await store.insertDocument({
          id,
          contact_id: parsed.data.contact_id,
          document_type: parsed.data.document_type,
          owner_actor: actor,
          object_key: objectKey,
          encrypted_dek: `\\x${envelope.encryptedDek.toString("hex")}`,
          payload_iv: `\\x${envelope.payloadIv.toString("hex")}`,
          wrap_iv: `\\x${envelope.wrapIv.toString("hex")}`,
          content_sha256: envelope.contentSha256,
          ciphertext_size: envelope.ciphertext.length,
          mime_type: parsed.data.mime_type,
          retention_until: parsed.data.retention_until ?? null,
        });
        await auditRequired(id, actor, parsed.data.purpose, "create", "ok");
        return json(res, 201, { secure_document_id: record.id, classification: "restringido" });
      } catch (error) {
        if (record) await store.deleteDocument(id).catch(() => console.error("[secure-documents] metadata_cleanup_failed"));
        await store.deleteObject(objectKey).catch(() => console.error("[secure-documents] orphan_cleanup_failed"));
        throw error;
      }
    }

    const match = url.pathname.match(/^\/v1\/documents\/([0-9a-f-]{36})$/i);
    if (req.method === "GET" && match) {
      const id = match[1];
      const purpose = url.searchParams.get("purpose")?.trim() ?? "";
      if (purpose.length < 3 || purpose.length > 240) return json(res, 400, { error: "purpose_required" });
      const record = await store.getDocument(id);
      if (!record) {
        await audit(id, actor, purpose, "read_content", false, "not_found");
        return json(res, 404, { error: "not_found" });
      }
      if (!canRead(actor, record)) {
        await audit(id, actor, purpose, "read_content", false, "denied");
        return json(res, 403, { error: "forbidden" });
      }
      // Registrar la lectura autorizada antes de descargar o descifrar. Si la
      // auditoría no está disponible, no se materializa plaintext en memoria.
      await auditRequired(id, actor, purpose, "read_content", "ok");
      const ciphertext = await store.downloadObject(record.object_key);
      const plain = decryptEnvelope(record, ciphertext, masterKey);
      res.writeHead(200, { "Content-Type": record.mime_type, "Content-Length": plain.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return res.end(plain);
    }

    return json(res, 404, { error: "not_found" });
  } catch (error) {
    console.error("[secure-documents] request_failed", error instanceof Error ? error.message : "unknown");
    return json(res, error?.message === "body_too_large" ? 413 : 503, { error: "service_unavailable" });
  }
});

server.listen(port, host, () => console.log(`[secure-documents] listening on ${host}:${port}`));

const shutdown = () => server.close(() => { masterKey.fill(0); process.exit(0); });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
