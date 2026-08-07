import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { bearerAuthorized, operationForPath } from "./src/auth.js";

const host = process.env.KNOWLEDGE_CONTROLLER_HOST ?? "0.0.0.0";
const port = Number(process.env.KNOWLEDGE_CONTROLLER_PORT ?? "8095");
const token = process.env.KNOWLEDGE_CONTROLLER_TOKEN ?? "";
let running = null;

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": payload.length, "Cache-Control": "no-store" });
  res.end(payload);
}

function executeFixed(operation) {
  const [command, ...args] = operation.argv;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: operation.name === "backup" ? 30 * 60_000 : 5 * 60_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-8_192); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-8_192); });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve({ operation: operation.name, ok: true, output: stdout.trim().slice(-2_000) })
      : reject(new Error(`${operation.name}_failed:${code}:${stderr.trim().slice(-500)}`)));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, running });
  let authorized = false;
  try { authorized = bearerAuthorized(req.headers.authorization, token); }
  catch { return json(res, 503, { error: "configuration_invalid" }); }
  if (!authorized) return json(res, 401, { error: "unauthorized" });
  const operation = operationForPath(req.method, url.pathname);
  if (!operation) return json(res, 404, { error: "not_found" });
  if (running) return json(res, 409, { error: "operation_in_progress", operation: running });

  running = operation.name;
  try {
    const result = await executeFixed(operation);
    return json(res, 200, result);
  } catch (error) {
    console.error("[knowledge-controller] operation_failed", operation.name);
    return json(res, 503, { error: "operation_failed", operation: operation.name });
  } finally {
    running = null;
  }
});

server.listen(port, host, () => console.log(`[knowledge-controller] listening on ${host}:${port}`));
