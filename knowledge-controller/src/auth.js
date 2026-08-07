import { timingSafeEqual } from "node:crypto";

export function bearerAuthorized(header, expected) {
  if (typeof expected !== "string" || expected.length < 32) throw new Error("controller_token_invalid");
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export const OPERATIONS = Object.freeze({
  sync: ["/app/scripts/sync.sh"],
  validate: ["node", "/knowledge/vault/tools/validate-vault.mjs", "/knowledge/vault"],
  views: ["/app/scripts/views.sh"],
  backup: ["/app/scripts/backup.sh"],
});

export function operationForPath(method, pathname) {
  if (method !== "POST") return null;
  const name = pathname.match(/^\/v1\/(sync|validate|views|backup)$/)?.[1];
  return name ? { name, argv: OPERATIONS[name] } : null;
}
