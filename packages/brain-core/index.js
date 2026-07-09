// ============================================================
// brain-core — barrel (Black Gold)
// ============================================================
// Reexporta la capa compartida de "lógica de las tools" del cerebro:
// rack documental (BM25), diagnóstico de pilares y readiness/recuperación.
// Consumido por ruta relativa (blackgold-mcp hoy; Edge Functions
// brain-gateway en el futuro). Ver README.md.

export { extraerFrontmatter, partirEnChunks, buscarRack, contextoRack, inventarioRack } from "./rack.js";
export { analizarPilares, construirPromptDiagnostico } from "./diagnostico.js";
export { analizarReadiness, construirPromptReadiness, RECUPERACION_TRIGGERS, RECUPERACION_CONDICIONES } from "./readiness.js";
