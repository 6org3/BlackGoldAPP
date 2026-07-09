// ============================================================
// brain-core — barrel (Black Gold)
// ============================================================
// Reexporta la capa compartida de "lógica de las tools" del cerebro:
// rack documental (BM25), diagnóstico de pilares y readiness/recuperación.
// Consumido por ruta relativa (blackgold-mcp hoy; Edge Functions
// brain-gateway en el futuro). Ver README.md.

// OJO: este barrel arrastra rack.js (fs/path, Node-only). Las Edge Functions
// (Deno) NO lo importan: usan directamente los módulos portables
// diagnostico.js / readiness.js espejados en supabase/functions/_shared.
export { extraerFrontmatter, partirEnChunks, buscarRack, contextoRack, inventarioRack } from "./rack.js";
export { analizarPilares } from "./diagnostico.js";
export { analizarReadiness, RECUPERACION_TRIGGERS, RECUPERACION_CONDICIONES } from "./readiness.js";
export { construirPromptDiagnostico, construirPromptReadiness } from "./prompts.js";
