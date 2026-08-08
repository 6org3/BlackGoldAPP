import test from "node:test";
import assert from "node:assert/strict";
import { bearerAuthorized, operationForPath } from "../src/auth.js";

test("constant-time bearer policy rejects malformed values", () => {
  const token = "x".repeat(40);
  assert.equal(bearerAuthorized(`Bearer ${token}`, token), true);
  assert.equal(bearerAuthorized(`Bearer ${"y".repeat(40)}`, token), false);
  assert.equal(bearerAuthorized("Basic test", token), false);
  assert.throws(() => bearerAuthorized("Bearer short", "short"));
});

test("only fixed operations are routable", () => {
  assert.equal(operationForPath("POST", "/v1/sync").name, "sync");
  assert.equal(operationForPath("POST", "/v1/backup").name, "backup");
  assert.equal(operationForPath("GET", "/v1/sync"), null);
  assert.equal(operationForPath("POST", "/v1/shell"), null);
  assert.equal(operationForPath("POST", "/v1/sync?cmd=id"), null);
});
