const jsonHeaders = (key) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

export function createSupabaseStore(url, key) {
  const base = new URL(url);
  if (base.protocol !== "https:" && base.hostname !== "127.0.0.1" && base.hostname !== "localhost") {
    throw new Error("supabase_url_invalid");
  }
  const request = async (path, options = {}) => {
    const response = await fetch(new URL(path, base), { redirect: "error", signal: AbortSignal.timeout(10_000), ...options });
    if (!response.ok) throw new Error(`supabase_${response.status}`);
    return response;
  };

  return {
    async uploadObject(objectKey, bytes) {
      await request(`/storage/v1/object/secure-documents/${objectKey}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/octet-stream", "x-upsert": "false" },
        body: bytes,
      });
    },
    async deleteObject(objectKey) {
      await request("/storage/v1/object/secure-documents", {
        method: "DELETE",
        headers: jsonHeaders(key),
        body: JSON.stringify({ prefixes: [objectKey] }),
      });
    },
    async downloadObject(objectKey) {
      const response = await request(`/storage/v1/object/authenticated/secure-documents/${objectKey}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      return Buffer.from(await response.arrayBuffer());
    },
    async insertDocument(record) {
      const response = await request("/rest/v1/crm_secure_documents", {
        method: "POST",
        headers: { ...jsonHeaders(key), Prefer: "return=representation" },
        body: JSON.stringify(record),
      });
      return (await response.json())[0];
    },
    async getDocument(id) {
      const response = await request(`/rest/v1/crm_secure_documents?id=eq.${encodeURIComponent(id)}&select=*`, {
        headers: jsonHeaders(key),
      });
      return (await response.json())[0] ?? null;
    },
    async deleteDocument(id) {
      await request(`/rest/v1/crm_secure_documents?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: jsonHeaders(key),
      });
    },
    async audit(event) {
      await request("/rest/v1/crm_secure_document_access", {
        method: "POST",
        headers: jsonHeaders(key),
        body: JSON.stringify(event),
      });
    },
  };
}
