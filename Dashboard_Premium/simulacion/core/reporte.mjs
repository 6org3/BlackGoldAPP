// core/reporte.mjs — Bitácora estructurada del loop.
// Cada día escribe una línea JSONL (fácil de analizar por el agente de
// Antigravity) y al final un resumen .md legible. Los HALLAZGOS (violaciones de
// invariantes) son el producto principal para el objetivo "encontrar bugs".

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'reportes');
fs.mkdirSync(DIR, { recursive: true });

export function crearReporte(etiqueta = 'run') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonl = path.join(DIR, `${etiqueta}-${stamp}.jsonl`);
  const hallazgos = [];
  const metricas = { dias: 0, acciones: 0, escrituras: 0, errores: 0, hallazgos: 0, latencias: [] };

  const linea = (obj) => fs.appendFileSync(jsonl, JSON.stringify(obj) + '\n');

  return {
    jsonl,
    dia(info) { metricas.dias++; linea({ t: 'dia', ...info }); },
    accion(info) { metricas.acciones++; linea({ t: 'accion', ...info }); },
    error(info) { metricas.errores++; linea({ t: 'error', ...info }); console.error('  ⚠️', info.msg || info); },
    latencia(ms) { metricas.latencias.push(ms); },
    // Un hallazgo = posible bug. severidad: 'alta' | 'media' | 'baja'.
    hallazgo({ regla, severidad = 'media', detalle, contexto }) {
      metricas.hallazgos++;
      const h = { t: 'hallazgo', regla, severidad, detalle, contexto };
      hallazgos.push(h); linea(h);
      console.log(`  🐛 [${severidad}] ${regla}: ${detalle}`);
    },
    resumen() {
      const lat = metricas.latencias.slice().sort((a, b) => a - b);
      const p = (q) => (lat.length ? lat[Math.floor(q * (lat.length - 1))] : 0);
      const md = path.join(DIR, `RESUMEN-${etiqueta}-${stamp}.md`);
      const porSeveridad = hallazgos.reduce((a, h) => ((a[h.severidad] = (a[h.severidad] || 0) + 1), a), {});
      fs.writeFileSync(md, [
        `# Resumen simulación — ${etiqueta}`,
        '',
        `- Días simulados: **${metricas.dias}**`,
        `- Acciones: **${metricas.acciones}**  ·  Escrituras: **${metricas.escrituras || (metricas.acciones)}**`,
        `- Errores de ejecución: **${metricas.errores}**`,
        `- Hallazgos (posibles bugs): **${metricas.hallazgos}** ${JSON.stringify(porSeveridad)}`,
        `- Latencia servicios: p50 ${p(0.5)}ms · p95 ${p(0.95)}ms · máx ${lat[lat.length - 1] || 0}ms`,
        '',
        '## Hallazgos',
        ...(hallazgos.length ? hallazgos.map((h) => `- **[${h.severidad}] ${h.regla}** — ${h.detalle}  \n  \`${JSON.stringify(h.contexto || {})}\``) : ['- (ninguno) ✅']),
        '',
        `JSONL detallado: \`${path.basename(jsonl)}\``,
      ].join('\n'));
      console.log(`\n📄 Resumen: ${md}`);
      return { md, metricas, hallazgos };
    },
  };
}
