// Smoke del rack documental: `npm run rack` (o `node src/rack.selftest.js "consulta"`).
// No toca Supabase — solo indexación y recuperación locales.
import { buscarRack, inventarioRack } from "./rack.js";

const inv = inventarioRack();
console.log(`Rack: ${inv.documentos.length} documento(s), ${inv.totalFragmentos} fragmento(s), áreas: ${inv.areas.join(", ")}\n`);
inv.documentos.forEach(d =>
  console.log(`  - [${d.area}] ${d.archivo} — "${d.titulo}" (${d.secciones} secciones, ${d.fragmentos} fragmentos)`));

const consultas = process.argv[2]
  ? [process.argv[2]]
  : [
      "fases sensibles fuerza edad iniciación",
      "umbrales salto vertical CMJ Sub15",
      "detección de talentos batería pruebas Ecuador",
      "recuperación sueño hidratación fatiga",
      "mentalidad competitiva resiliencia",
    ];

for (const q of consultas) {
  console.log(`\n▶ "${q}"`);
  const hits = buscarRack(q, { k: 3 });
  if (hits.length === 0) {
    console.log("  (sin resultados)");
    continue;
  }
  hits.forEach(h =>
    console.log(`  ${h.score.toFixed(2).padStart(6)}  [${h.archivo} › ${h.seccion}]  ${h.texto.slice(0, 90).replace(/\s+/g, " ")}…`));
}
