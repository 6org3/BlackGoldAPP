import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { calcularCategoriaFEB } from "../../packages/analytics-core/categoriaFEB.js";
import { BAREMOS, categoriaABucketBaremo, resolverUmbrales } from "../../packages/analytics-core/baremos.js";
import { SUB_PILARES as SUB_PILARES_TAXONOMIA, getSubPilar } from "../../packages/analytics-core/taxonomia.js";
// Motor de recomendación COMPARTIDO (un solo cerebro): el mismo que usa la web
// (vía el shim src/lib/didacticEngine.js) y la Edge Function.
import { evaluarDeficits, emparejarMisionesPorCondicion } from "../../packages/analytics-core/didactica.js";
import { calcularReadinessScore, detectarAlertasRecuperacion } from "../../packages/analytics-core/readiness.js";

// Resuelto contra la ubicación del script, no contra process.cwd(): un cliente MCP
// (Claude Code, Claude Desktop) lanza este proceso con el cwd del host, no de este paquete.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const server = new McpServer({
  name: "blackgold-mcp",
  version: "1.0.0"
});

// Tool 1: Analyze Athlete Pillars
server.tool(
  "analyze_athlete_pillars",
  "Genera un resumen analítico de los 7 pilares de un atleta basado en sus evaluaciones físicas, técnicas y percepciones subjetivas.",
  {
    athlete_id: z.string().describe("UUID del atleta a evaluar")
  },
  async ({ athlete_id }) => {
    try {
      // Obtener el atleta. `athlete_id` es atletas.id (la misma FK que usa
      // evaluaciones_pruebas.atleta_id más abajo) — se hace join a usuarios para el
      // nombre y la fecha de nacimiento. La categoría se deriva con
      // calcularCategoriaFEB() (packages/analytics-core, compartido con la web app) en
      // vez de leer una columna usuarios.categoria_actual que no existe en el esquema
      // (el resto del repo usa usuarios.categoria) — esa columna inexistente hacía que
      // esta consulta fallara siempre con un error de Postgres.
      const { data: atleta, error: atletaError } = await supabase
        .from("atletas")
        .select("usuarios!inner!atletas_usuario_id_fkey(nombre, fecha_nacimiento)")
        .eq("id", athlete_id)
        .single();

      if (atletaError) throw new Error("Atleta no encontrado: " + atletaError.message);

      const categoria = calcularCategoriaFEB(atleta.usuarios.fecha_nacimiento) || "Sin categoría";

      // Obtener evaluaciones recientes
      const { data: evaluaciones, error: evalError } = await supabase
        .from("evaluaciones_pruebas")
        .select("*")
        .eq("atleta_id", athlete_id)
        .order("created_at", { ascending: false })
        .limit(20);
        
      if (evalError) throw new Error("Error al obtener evaluaciones: " + evalError.message);

      let pilarStats = {};
      let notasSubjetivas = [];

      evaluaciones.forEach(ev => {
        if (!pilarStats[ev.sub_pilar]) {
          pilarStats[ev.sub_pilar] = { count: 0, sumScore: 0, currentTier: ev.tier };
        }
        pilarStats[ev.sub_pilar].count++;
        pilarStats[ev.sub_pilar].sumScore += ev.puntuacion_normalizada || 0;
        if (ev.notas) notasSubjetivas.push(`[${ev.sub_pilar}] ${ev.notas}`);
      });

      let promptInfo = `Atleta: ${atleta.usuarios.nombre} (${categoria})\n`;
      promptInfo += "--- RESULTADOS POR SUB-PILAR ---\n";
      for (const pilar in pilarStats) {
        let avg = Math.round(pilarStats[pilar].sumScore / pilarStats[pilar].count);
        promptInfo += `- ${pilar.toUpperCase()}: Promedio ${avg}/100 (Último tier: ${pilarStats[pilar].currentTier})\n`;
      }
      
      promptInfo += "\n--- NOTAS SUBJETIVAS (Coach/Atleta) ---\n";
      promptInfo += notasSubjetivas.length ? notasSubjetivas.join("\n") : "Sin notas.";
      
      promptInfo += "\n\nINSTRUCCIÓN PARA LA IA: Procesa esta información y da un diagnóstico de 360 grados sobre el rendimiento de este atleta.";

      return {
        content: [{ type: "text", text: promptInfo }]
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 2: Generate Custom Mission
server.tool(
  "generate_custom_mission",
  "Asigna misiones o aconseja entrenamientos individualizados para mejorar cada pilar detectado como débil.",
  {
    athlete_id: z.string().describe("UUID del atleta a evaluar")
  },
  async ({ athlete_id }) => {
    try {
      const { data: evaluaciones } = await supabase
        .from("evaluaciones_pruebas")
        .select("sub_pilar, tier")
        .eq("atleta_id", athlete_id)
        .order("created_at", { ascending: false })
        .limit(30);

      // Agrupar los peores tiers
      let debilidades = new Set();
      (evaluaciones || []).forEach(ev => {
        if (ev.tier === 'poor' || ev.tier === 'below_avg') {
          debilidades.add(ev.sub_pilar);
        }
      });

      let promptInfo = `Atleta ID: ${athlete_id}\n`;
      promptInfo += `Pilares Críticos Detectados (Bajo Promedio): ${Array.from(debilidades).join(", ") || "Ninguno"}\n\n`;
      promptInfo += "INSTRUCCIÓN PARA LA IA: Asigna misiones específicas o aconseja entrenamientos súper individualizados para mejorar CADA UNO de los pilares débiles detectados. Si es 'Ninguno', genera una misión de mantenimiento avanzado. Responde en formato atractivo para el atleta.";

      return { content: [{ type: "text", text: promptInfo }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 3: Suggest Next Test
server.tool(
  "suggest_next_test",
  "Analiza el historial de evaluaciones y sugiere qué prueba debería tomar el atleta próximamente con su explicación lógica.",
  {
    athlete_id: z.string().describe("UUID del atleta a evaluar")
  },
  async ({ athlete_id }) => {
    try {
      const { data: evaluaciones } = await supabase
        .from("evaluaciones_pruebas")
        .select("prueba_tipo, sub_pilar, created_at")
        .eq("atleta_id", athlete_id)
        .order("created_at", { ascending: false });

      let lastTests = {};
      (evaluaciones || []).forEach(ev => {
        if (!lastTests[ev.sub_pilar]) {
          lastTests[ev.sub_pilar] = ev.created_at;
        }
      });

      let promptInfo = `Atleta ID: ${athlete_id}\n`;
      promptInfo += `Últimas evaluaciones por pilar:\n`;
      for (const [pilar, date] of Object.entries(lastTests)) {
        promptInfo += `- ${pilar}: ${new Date(date).toLocaleDateString()}\n`;
      }

      promptInfo += "\nINSTRUCCIÓN PARA LA IA: Teniendo en cuenta los 7 sub-pilares (explosividad, fuerza, movilidad, tiro, agilidad, tactica, resiliencia), detecta cuáles no han sido evaluados o hace más tiempo no se evalúan. Sugiere la siguiente prueba específica (ej: CMJ, Lane Agility, etc) y BRINDA UNA EXPLICACIÓN LÓGICA y científica de por qué debe evaluarse eso ahora.";

      return { content: [{ type: "text", text: promptInfo }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Condiciones de recuperación (déficits de disponibilidad/riesgo) que produce el motor
// compartido evaluarDeficits/detectarAlertasRecuperacion. Sirven de `condicion_trigger`
// para las misiones de recuperación (pilar='recuperacion').
const RECUPERACION_TRIGGERS = [
  "deshidratado_extremo",
  "hidratacion_baja",
  "sueno_deficiente",
  "fatiga_alta",
  "sobreentrenamiento_activo",
  "fatiga_silenciosa",
  "rpe_extremo",
];
const RECUPERACION_CONDICIONES = new Set([...RECUPERACION_TRIGGERS, "percepcion_alterada"]);

// Tool 6: Analizar Readiness / Recuperación y recomendar misiones
server.tool(
  "analyze_athlete_readiness",
  "Analiza la recuperación del atleta (check-in diario: sueño, fatiga, hidratación de la tabla atleta_readiness + estado_recuperacion) usando el motor compartido, y recomienda misiones de recuperación del catálogo. La recuperación es una señal de disponibilidad/riesgo, NO una nota de rendimiento.",
  {
    athlete_id: z.string().describe("UUID del atleta (atletas.id)")
  },
  async ({ athlete_id }) => {
    try {
      // Último check-in de readiness + estado de recuperación del atleta.
      const [{ data: readiness }, { data: atleta }] = await Promise.all([
        supabase
          .from("atleta_readiness")
          .select("sueno_calidad, fatiga_fisica, color_orina, fecha")
          .eq("atleta_id", athlete_id)
          .order("fecha", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("atletas")
          .select("estado_recuperacion")
          .eq("id", athlete_id)
          .maybeSingle(),
      ]);

      if (!readiness && !(atleta && atleta.estado_recuperacion)) {
        return { content: [{ type: "text", text: `El atleta ${athlete_id} no tiene check-in de readiness ni estado de recuperación registrado. Pídele completar el Check-in Diario.` }] };
      }

      const score = calcularReadinessScore(readiness);

      // Déficits de recuperación con el MISMO motor que la web/Edge. Se pasan evals
      // vacías a propósito: aquí solo interesan las condiciones de recuperación, no las
      // debilidades de rendimiento (esas las cubren analyze_athlete_pillars / el loop).
      const atletaObj = {
        readiness_hoy: readiness || null,
        estado_recuperacion: atleta?.estado_recuperacion || null,
        _evaluaciones: [],
      };
      const deficits = evaluarDeficits(atletaObj).filter(d => RECUPERACION_CONDICIONES.has(d.condicion));

      // Misiones de recuperación del catálogo activo cuyo trigger coincide con una
      // condición activa. Emparejamiento vía la función COMPARTIDA (misma que getAutoMissions).
      const { data: misiones } = await supabase
        .from("misiones")
        .select("id, titulo, condicion_trigger, complejidad, xp_recompensa, activa, pilar")
        .eq("activa", true)
        .eq("pilar", "recuperacion");

      const recomendadas = emparejarMisionesPorCondicion(deficits, misiones || []);

      let out = `=== READINESS / RECUPERACIÓN ===\n`;
      out += `Atleta: ${athlete_id}\n`;
      out += readiness
        ? `Check-in (${readiness.fecha}): sueño ${readiness.sueno_calidad}/10, fatiga ${readiness.fatiga_fisica}/10, hidratación (orina) ${readiness.color_orina}/8.\n`
        : `Sin check-in diario reciente.\n`;
      out += score != null ? `Readiness score: ${score}/100 (más = mejor recuperado; NO entra al overall ni al radar).\n` : "";
      if (atleta?.estado_recuperacion) out += `Estado de recuperación: ${atleta.estado_recuperacion}.\n`;

      out += `\n--- ALERTAS ---\n`;
      out += deficits.length
        ? deficits.map(d => `- [${d.prioridad.toUpperCase()}] ${d.mensaje}`).join("\n")
        : "Sin alertas de recuperación: disponibilidad adecuada.";

      out += `\n\n--- MISIONES DE RECUPERACIÓN RECOMENDADAS ---\n`;
      if (!misiones || misiones.length === 0) {
        out += `El catálogo NO tiene misiones de recuperación (pilar='recuperacion'). Redáctalas con justificación científica (higiene de sueño, hidratación, recuperación activa, manejo de carga) y créalas con insertar_misiones_recuperacion.`;
      } else if (recomendadas.length === 0) {
        out += `Hay misiones de recuperación en el catálogo pero ninguna aplica a las condiciones activas de hoy.`;
      } else {
        out += recomendadas.map(m => `- ${m.titulo} (${m.complejidad}, ${m.xp_recompensa ?? "?"} XP) → trigger: ${m.condicion_trigger}`).join("\n");
      }

      out += `\n\nINSTRUCCIÓN PARA LA IA: prioriza recuperación sobre carga cuando haya alertas críticas. Sugiere hábitos accionables por el propio atleta y, si el coach lo aprueba, asigna las misiones recomendadas.`;

      return { content: [{ type: "text", text: out }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ============================================================
// CATÁLOGO DE MISIONES (D3 del spec loop misiones-baremo):
// el MCP propone misiones con justificación científica, el coach
// las activa desde AdminMisiones. Matriz objetivo:
// 7 sub-pilares × 3 niveles × 4 buckets de edad = 84 celdas.
// ============================================================

// Derivado de la taxonomía compartida (fuente única) — hoy 7 sub-pilares; cuando
// 'resistencia' entre a taxonomia.js (tras sus primeras pruebas, ver
// insertar_pruebas_evaluacion), la matriz de misiones crece sola a 8.
const SUB_PILARES = SUB_PILARES_TAXONOMIA.map(s => s.key);
const NIVELES = ["Micro", "Desarrollo", "Elite"];
const BUCKETS = ["Sub12", "Sub15", "Sub18", "Senior"];

const TOTAL_CELDAS = () => SUB_PILARES.length * NIVELES.length * BUCKETS.length;

const claveCelda = (subPilar, nivel, bucket) => `${subPilar}|${nivel}|${bucket}`;

// Cobertura actual de la matriz: una celda está cubierta si tiene ≥1 misión
// 'general' Y ≥1 'especifica' (activas o propuestas — la curaduría es del coach).
function calcularCobertura(misiones) {
  const porCelda = {};
  (misiones || []).forEach(m => {
    if (!SUB_PILARES.includes(m.pilar) || !m.nivel_objetivo || !m.categoria_bucket) return;
    const clave = claveCelda(m.pilar, m.nivel_objetivo, m.categoria_bucket);
    if (!porCelda[clave]) porCelda[clave] = { general: 0, especifica: 0 };
    porCelda[clave][m.complejidad === "general" ? "general" : "especifica"]++;
  });

  const faltantes = [];
  let cubiertas = 0;
  SUB_PILARES.forEach(sp => NIVELES.forEach(niv => BUCKETS.forEach(b => {
    const c = porCelda[claveCelda(sp, niv, b)];
    if (c && c.general >= 1 && c.especifica >= 1) {
      cubiertas++;
    } else {
      faltantes.push({ sub_pilar: sp, nivel: niv, bucket: b, tiene: c || { general: 0, especifica: 0 } });
    }
  })));
  return { cubiertas, faltantes };
}

// Tool 4: Generar Catálogo de Misiones
server.tool(
  "generar_catalogo_misiones",
  "Analiza la cobertura del catálogo de misiones (matriz 7 sub-pilares × 3 niveles × 4 buckets de edad), prioriza las celdas faltantes según los atletas reales del club, y devuelve las instrucciones para redactar las misiones faltantes con justificación científica. Tras redactarlas, insertarlas con insertar_misiones_catalogo.",
  {
    sub_pilar: z.enum(SUB_PILARES).optional().describe("Limitar a un sub-pilar"),
    nivel: z.enum(NIVELES).optional().describe("Limitar a un nivel"),
    categoria_bucket: z.enum(BUCKETS).optional().describe("Limitar a un bucket de edad"),
  },
  async ({ sub_pilar, nivel, categoria_bucket }) => {
    try {
      const { data: misiones, error: misError } = await supabase
        .from("misiones")
        .select("id, pilar, nivel_objetivo, categoria_bucket, complejidad, activa");
      if (misError) throw new Error("Error consultando misiones: " + misError.message +
        (misError.message.includes("column") ? " — aplica primero la migración loop_misiones_fase1 (npx supabase db push)." : ""));

      // Buckets con atletas REALES del club (priorización de celdas)
      const { data: atletasClub, error: atlError } = await supabase
        .from("usuarios")
        .select("fecha_nacimiento")
        .eq("rol", "atleta")
        .not("fecha_nacimiento", "is", null);
      if (atlError) throw new Error("Error consultando atletas: " + atlError.message);

      const bucketsConAtletas = new Set(
        (atletasClub || [])
          .map(a => categoriaABucketBaremo(calcularCategoriaFEB(a.fecha_nacimiento)))
          .filter(Boolean)
      );

      const { cubiertas, faltantes } = calcularCobertura(misiones);

      let pendientes = faltantes.filter(f =>
        (!sub_pilar || f.sub_pilar === sub_pilar) &&
        (!nivel || f.nivel === nivel) &&
        (!categoria_bucket || f.bucket === categoria_bucket)
      );
      // Primero las celdas de buckets donde hay atletas reales
      pendientes.sort((a, b) =>
        (bucketsConAtletas.has(b.bucket) ? 1 : 0) - (bucketsConAtletas.has(a.bucket) ? 1 : 0));

      // Umbrales de los baremos como contexto de qué se mide en cada sub-pilar
      const subPilaresPedidos = sub_pilar ? [sub_pilar] : [...new Set(pendientes.map(p => p.sub_pilar))];
      let contextoBaremos = "";
      subPilaresPedidos.forEach(sp => {
        const pruebas = Object.entries(BAREMOS).filter(([, b]) => b.sub_pilar === sp);
        if (pruebas.length === 0) return;
        contextoBaremos += `\nSub-pilar "${sp}" — se mide con:\n`;
        pruebas.forEach(([key, b]) => {
          contextoBaremos += `  · ${b.label} (${key}, ${b.unidad}, ${b.tipo}): umbrales ${JSON.stringify(b.thresholds)}\n`;
        });
      });

      let prompt = `=== COBERTURA DEL CATÁLOGO DE MISIONES ===\n`;
      prompt += `Celdas cubiertas: ${cubiertas}/${TOTAL_CELDAS()} (cubierta = ≥1 general Y ≥1 específica).\n`;
      prompt += `Buckets con atletas reales en el club (PRIORIDAD): ${[...bucketsConAtletas].join(", ") || "ninguno"}.\n\n`;
      prompt += `=== CELDAS FALTANTES (priorizadas) ===\n`;
      pendientes.slice(0, 30).forEach(f => {
        prompt += `- ${f.sub_pilar} × ${f.nivel} × ${f.bucket}` +
          ` (tiene ${f.tiene.general} general/${f.tiene.especifica} específica)` +
          (bucketsConAtletas.has(f.bucket) ? "  ← ATLETAS REALES" : "") + `\n`;
      });
      if (pendientes.length > 30) prompt += `… y ${pendientes.length - 30} celdas más (pide por sub_pilar para acotar).\n`;
      prompt += `\n=== CONTEXTO CIENTÍFICO (umbrales de baremos) ===${contextoBaremos || "\n(sin pruebas asociadas)"}\n`;
      prompt += `
=== INSTRUCCIONES DE REDACCIÓN ===
Para cada celda faltante genera misiones con:
- titulo: motivador, máx 60 caracteres.
- descripcion: ejecutable por un chico de esa edad (bucket) sin supervisión especial.
- justificacion: fundamento científico CON FUENTE (NSCA, FitnessGram, PubMed) de por qué
  ese trabajo mejora ese sub-pilar a esa edad — mismo estándar que packages/analytics-core/baremos_cientificos.md.
- xp_recompensa coherente con el nivel: Micro≈25, Desarrollo≈50, Elite≈75.
- complejidad: 'general' = hábito/educativa auto-asignable al atleta; 'especifica' = técnica
  que requiere criterio del coach antes de ser visible.
- video_url: opcional; SOLO YouTube real y pertinente.

Cuando tengas el lote redactado, llama a la herramienta insertar_misiones_catalogo con el array JSON.
Las misiones nacen inactivas (activa=false): el coach las revisa y activa desde AdminMisiones.`;

      return { content: [{ type: "text", text: prompt }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 5: Insertar Misiones al Catálogo
server.tool(
  "insertar_misiones_catalogo",
  "Inserta en lote las misiones redactadas para el catálogo (nacen inactivas, is_ai_generated=true; el coach las activa desde AdminMisiones). Valida contra los CHECKs reales de la tabla misiones.",
  {
    misiones: z.array(z.object({
      titulo: z.string().min(5),
      descripcion: z.string().min(20),
      justificacion: z.string().min(30),
      pilar: z.enum(SUB_PILARES),
      nivel_objetivo: z.enum(NIVELES),
      categoria_bucket: z.enum(BUCKETS),
      complejidad: z.enum(["general", "especifica"]),
      xp_recompensa: z.number().int().positive(),
      video_url: z.string().url().optional(),
    })).min(1).describe("Lote de misiones a insertar"),
  },
  async ({ misiones }) => {
    try {
      const filas = misiones.map(m => ({
        titulo: m.titulo,
        descripcion: m.descripcion,
        justificacion: m.justificacion,
        pilar: m.pilar,
        nivel_objetivo: m.nivel_objetivo,
        categoria_bucket: m.categoria_bucket,
        complejidad: m.complejidad,
        xp_recompensa: m.xp_recompensa,
        video_url: m.video_url ?? null,
        activa: false,
        is_ai_generated: true,
        condicion_trigger: "catalogo_mcp",
      }));

      const { error: insError } = await supabase.from("misiones").insert(filas);
      if (insError) {
        throw new Error("Error insertando misiones: " + insError.message +
          (insError.message.includes("column") ? " — aplica primero la migración loop_misiones_fase1 (npx supabase db push)." : ""));
      }

      // Recalcular cobertura post-insert
      const { data: todas } = await supabase
        .from("misiones")
        .select("id, pilar, nivel_objetivo, categoria_bucket, complejidad, activa");
      const { cubiertas } = calcularCobertura(todas);

      return {
        content: [{
          type: "text",
          text: `✅ ${filas.length} misión(es) insertada(s) con activa=false (pendientes de curaduría del coach en AdminMisiones).\nCobertura de la matriz tras el insert: ${cubiertas}/${TOTAL_CELDAS()} celdas.`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 7: Insertar Misiones de Recuperación al Catálogo
server.tool(
  "insertar_misiones_recuperacion",
  "Inserta misiones de recuperación (pilar='recuperacion', nivel/bucket agnósticos) que analyze_athlete_readiness recomendará cuando el atleta tenga alertas de sueño/fatiga/hidratación/carga. Nacen inactivas (activa=false); el coach las activa desde AdminMisiones. Son la contraparte de contenido del motor de recuperación.",
  {
    misiones: z.array(z.object({
      titulo: z.string().min(5),
      descripcion: z.string().min(20),
      justificacion: z.string().min(30).describe("Fundamento científico con fuente (higiene de sueño, hidratación, recuperación activa, gestión de carga)."),
      condicion_trigger: z.enum(RECUPERACION_TRIGGERS).describe("Condición de recuperación que activa la misión (la produce el motor compartido)."),
      complejidad: z.enum(["general", "especifica"]).default("general").describe("'general' = hábito auto-asignable al atleta; 'especifica' = requiere criterio del coach."),
      xp_recompensa: z.number().int().positive(),
      video_url: z.string().url().optional(),
    })).min(1).describe("Lote de misiones de recuperación a insertar"),
  },
  async ({ misiones }) => {
    try {
      const filas = misiones.map(m => ({
        titulo: m.titulo,
        descripcion: m.descripcion,
        justificacion: m.justificacion,
        pilar: "recuperacion",
        // Recuperación es agnóstica de nivel/edad: aplica a todos (null = comodín).
        nivel_objetivo: null,
        categoria_bucket: null,
        complejidad: m.complejidad ?? "general",
        condicion_trigger: m.condicion_trigger,
        xp_recompensa: m.xp_recompensa,
        video_url: m.video_url ?? null,
        activa: false,
        is_ai_generated: true,
      }));

      const { error: insError } = await supabase.from("misiones").insert(filas);
      if (insError) {
        throw new Error("Error insertando misiones de recuperación: " + insError.message);
      }

      return {
        content: [{
          type: "text",
          text: `✅ ${filas.length} misión(es) de recuperación insertada(s) con activa=false (pendientes de curaduría del coach en AdminMisiones). Triggers: ${[...new Set(filas.map(f => f.condicion_trigger))].join(", ")}.`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ============================================================
// AUTORÍA DE PRUEBAS DE EVALUACIÓN + BAREMOS (fase P1.5):
// el MCP propone pruebas con umbrales fundamentados en la guía
// metodológica ecuatoriana (Vinueza, knowledge/) y las inserta en
// catalogo_ejercicios. Cubre los 3 pilares / 8 sub-pilares
// (los 7 del radar + 'resistencia', pendiente de taxonomía).
// ============================================================

const KNOWLEDGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "knowledge");
const DOC_METODOLOGIA = path.join(KNOWLEDGE_DIR, "fundamentos_iniciacion_vinueza.md");

// 'resistencia' se acepta en autoría ANTES de existir en taxonomia.js: la regla del
// club es que el sub-pilar entra al radar (7→8 ejes) recién cuando tiene pruebas con
// baremos — este tool es justamente la vía para crearlas.
const SUB_PILARES_PRUEBAS = [...new Set([...SUB_PILARES, "resistencia"])];
const GENEROS = ["Masculino", "Femenino"];
const BUCKETS_PRUEBA = [...BUCKETS, "Todas"];

const pilarDeSubPilar = (subPilar) =>
  subPilar === "resistencia" ? "fisico" : (getSubPilar(subPilar)?.pilar ?? null);

// --- Validación estructural de thresholds (mismas convenciones que resolverUmbrales) ---
function validarCortes(arr, ruta) {
  if (!Array.isArray(arr) || arr.length !== 4 || !arr.every(Number.isFinite)) {
    return `${ruta}: debe ser un array de exactamente 4 números [t1,t2,t3,t4]`;
  }
  for (let i = 1; i < 4; i++) {
    if (arr[i] <= arr[i - 1]) return `${ruta}: los cortes deben ser estrictamente ascendentes (t1<t2<t3<t4; también en pruebas menos_es_mejor, ej. lane_agility [13.0,13.9,14.9,16.0])`;
  }
  return null;
}

function validarPorBucket(obj, ruta) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return `${ruta}: debe ser un objeto { bucket: cortes }`;
  const keys = Object.keys(obj);
  if (keys.length === 0) return `${ruta}: sin buckets definidos`;
  for (const k of keys) {
    if (!BUCKETS_PRUEBA.includes(k)) return `${ruta}.${k}: bucket desconocido (usa ${BUCKETS_PRUEBA.join("/")})`;
    const v = obj[k];
    if (Array.isArray(v)) {
      const e = validarCortes(v, `${ruta}.${k}`);
      if (e) return e;
    } else if (v && typeof v === "object") {
      const niveles = Object.keys(v);
      if (niveles.length === 0) return `${ruta}.${k}: objeto por nivel vacío`;
      for (const n of niveles) {
        if (!NIVELES.includes(n)) return `${ruta}.${k}.${n}: nivel desconocido (usa ${NIVELES.join("/")})`;
        const e = validarCortes(v[n], `${ruta}.${k}.${n}`);
        if (e) return e;
      }
    } else {
      return `${ruta}.${k}: debe ser un array de 4 cortes o un objeto { Micro/Desarrollo/Elite: cortes }`;
    }
  }
  return null;
}

function validarThresholds(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return "thresholds: debe ser un objeto";
  const keys = Object.keys(t);
  const conGenero = keys.filter(k => GENEROS.includes(k));
  if (conGenero.length > 0) {
    if (conGenero.length !== keys.length) return "thresholds: no mezcles claves de género (Masculino/Femenino) con claves de bucket en el mismo nivel";
    for (const g of conGenero) {
      const e = validarPorBucket(t[g], `thresholds.${g}`);
      if (e) return e;
    }
    return null;
  }
  return validarPorBucket(t, "thresholds");
}

// Tool 8: Consultar la guía metodológica de iniciación (Vinueza, Ecuador)
server.tool(
  "consultar_metodologia_iniciacion",
  "Devuelve la guía metodológica de referencia del club para iniciación deportiva ('Fundamentos Técnico Metodológicos de la Planificación del Entrenamiento en la Iniciación Deportiva', Edwin Vinueza Tapia, Ecuador): fases sensibles por edad, pruebas de detección con normas ecuatorianas, dimorfismo sexual, planificación y sistema de evaluación. Consultarla ANTES de redactar pruebas/baremos con generar_catalogo_pruebas.",
  {},
  async () => {
    try {
      const texto = fs.readFileSync(DOC_METODOLOGIA, "utf8");
      return { content: [{ type: "text", text: texto }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error leyendo la guía metodológica (${DOC_METODOLOGIA}): ${err.message}` }] };
    }
  }
);

// Tool 9: Generar Catálogo de Pruebas de Evaluación
server.tool(
  "generar_catalogo_pruebas",
  "Analiza la cobertura del catálogo de pruebas de evaluación (catalogo_ejercicios) por sub-pilar — los 7 del radar + 'resistencia' — detectando huecos y pruebas con umbrales irresolubles, y devuelve las instrucciones para redactar las pruebas/baremos faltantes fundamentadas en la guía metodológica ecuatoriana (Vinueza). Tras redactarlas y validarlas con el cuerpo técnico, insertarlas con insertar_pruebas_evaluacion.",
  {
    sub_pilar: z.enum(SUB_PILARES_PRUEBAS).optional().describe("Limitar el análisis a un sub-pilar"),
  },
  async ({ sub_pilar }) => {
    try {
      const { data: pruebas, error: prError } = await supabase
        .from("catalogo_ejercicios")
        .select("nombre, pilar, sub_pilar, unidad, thresholds");
      if (prError) throw new Error("Error consultando catalogo_ejercicios: " + prError.message);

      // Distribución real del club (para priorizar buckets/niveles/género con atletas)
      const [{ data: usuariosAtletas }, { data: atletasNivel }] = await Promise.all([
        supabase.from("usuarios").select("fecha_nacimiento, genero").eq("rol", "atleta").not("fecha_nacimiento", "is", null),
        supabase.from("atletas").select("nivel_desarrollo"),
      ]);
      const bucketsConAtletas = new Set(
        (usuariosAtletas || []).map(a => categoriaABucketBaremo(calcularCategoriaFEB(a.fecha_nacimiento))).filter(Boolean)
      );
      const generosClub = {};
      (usuariosAtletas || []).forEach(a => { const g = a.genero || "Masculino"; generosClub[g] = (generosClub[g] || 0) + 1; });
      const nivelesClub = {};
      (atletasNivel || []).forEach(a => { const n = a.nivel_desarrollo || "(sin nivel)"; nivelesClub[n] = (nivelesClub[n] || 0) + 1; });

      // Una prueba está "viva" si su thresholds resuelve en algún bucket (con defaults).
      const resuelve = (t) => BUCKETS.some(b => resolverUmbrales(t, { bucket: b }) !== null);
      const segmentadaPorNivel = (t) => JSON.stringify(t || {}).includes('"Micro"') || JSON.stringify(t || {}).includes('"Elite"');

      const porSubPilar = {};
      const fueraDeTaxonomia = [];
      (pruebas || []).forEach(p => {
        if (SUB_PILARES_PRUEBAS.includes(p.sub_pilar)) {
          if (!porSubPilar[p.sub_pilar]) porSubPilar[p.sub_pilar] = { total: 0, vivas: 0, porNivel: 0, muertas: [] };
          const s = porSubPilar[p.sub_pilar];
          s.total++;
          if (resuelve(p.thresholds)) s.vivas++;
          else s.muertas.push(p.nombre);
          if (segmentadaPorNivel(p.thresholds)) s.porNivel++;
        } else {
          fueraDeTaxonomia.push(`${p.nombre} (sub_pilar='${p.sub_pilar}')`);
        }
      });

      const objetivo = sub_pilar ? [sub_pilar] : SUB_PILARES_PRUEBAS;
      let out = `=== COBERTURA DEL CATÁLOGO DE PRUEBAS (catalogo_ejercicios) ===\n`;
      out += `Buckets con atletas reales (PRIORIDAD): ${[...bucketsConAtletas].join(", ") || "ninguno"}.\n`;
      out += `Atletas por género: ${Object.entries(generosClub).map(([g, n]) => `${g} ${n}`).join(", ") || "sin datos"}.\n`;
      out += `Atletas por nivel de desarrollo: ${Object.entries(nivelesClub).map(([n, c]) => `${n} ${c}`).join(", ") || "sin datos"}.\n\n`;

      objetivo.forEach(sp => {
        const s = porSubPilar[sp] || { total: 0, vivas: 0, porNivel: 0, muertas: [] };
        const pilar = pilarDeSubPilar(sp);
        out += `- ${sp} (pilar ${pilar}): ${s.total} prueba(s), ${s.vivas} con umbrales resolubles, ${s.porNivel} segmentada(s) por nivel`;
        if (sp === "resistencia") out += `  ← SUB-PILAR NUEVO: aún fuera del radar; entra a taxonomia.js con sus primeras pruebas`;
        if (s.muertas.length) out += `\n    · umbrales irresolubles (revisar/reescribir): ${s.muertas.join("; ")}`;
        out += `\n`;
      });

      if (fueraDeTaxonomia.length && !sub_pilar) {
        out += `\n⚠️ Pruebas con sub_pilar FUERA de la taxonomía (no puntúan en ningún eje del radar; candidatas a reclasificar):\n`;
        fueraDeTaxonomia.forEach(p => { out += `  · ${p}\n`; });
      }

      out += `
=== CONTEXTO METODOLÓGICO (guía Vinueza — usa consultar_metodologia_iniciacion para el texto completo) ===
- Normas basadas en POBLACIÓN ECUATORIANA (mismo contexto del club): preferirlas a baremos importados cuando cubran la edad/prueba.
- Batería de detección validada (9-12 años): carrera 30m (velocidad), salto de longitud sin impulso (fuerza explosiva), abdominales 30s, flexiones de codo 30s, carrera de resistencia 600m (9-10 años) / 1000m (11-12 años).
- Fases sensibles: fuerza 10-12 años (sin cargas máximas), velocidad 7-10, resistencia aeróbica desde 9-10 (anaeróbica post-puberal), flexibilidad 6-12.
- Dimorfismo sexual documentado (tabla 2002): p.ej. carrera 40m a los 9 años F 9.2s vs M 8.5s → usa la capa de género en thresholds cuando la prueba lo amerite.

=== INSTRUCCIONES DE REDACCIÓN ===
Para cada prueba faltante define:
- nombre, descripcion (qué capacidad mide), protocolo (ejecución paso a paso medible en cancha).
- justificacion: fundamento científico CON FUENTE (Vinueza para normas ecuatorianas; NSCA/FitnessGram/PubMed como complemento).
- sub_pilar canónico (${SUB_PILARES_PRUEBAS.join("/")}), unidad, tipo ('mas_es_mejor' | 'menos_es_mejor').
- thresholds con 4 cortes ascendentes [t1,t2,t3,t4] por bucket (Sub12/Sub15/Sub18/Senior o 'Todas'), opcionalmente segmentados:
    · por nivel de desarrollo: { "Sub15": { "Micro": [...], "Desarrollo": [...], "Elite": [...] } } (REQUISITO del club para pruebas nuevas)
    · por género: { "Masculino": { ... }, "Femenino": { ... } } cuando el dimorfismo aplique (Vinueza 2002).

⚠️ Las pruebas insertadas aparecen INMEDIATAMENTE en la Evaluación Científica (no hay flag de curaduría en catalogo_ejercicios): insértalas solo tras validar los cortes con el owner/cuerpo técnico. Cuando el lote esté validado, llama a insertar_pruebas_evaluacion.`;

      return { content: [{ type: "text", text: out }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 10: Insertar Pruebas de Evaluación al Catálogo
server.tool(
  "insertar_pruebas_evaluacion",
  "Inserta en lote pruebas de evaluación con sus baremos en catalogo_ejercicios. Valida sub_pilar contra la taxonomía (+'resistencia'), y thresholds contra las convenciones del motor (bucket→[t1,t2,t3,t4] ascendentes; capas opcionales por género Masculino/Femenino y por nivel Micro/Desarrollo/Elite). ATENCIÓN: quedan visibles de inmediato en la Evaluación Científica — insertar solo baremos ya validados con el cuerpo técnico.",
  {
    pruebas: z.array(z.object({
      nombre: z.string().min(4),
      descripcion: z.string().min(20).describe("Qué capacidad mide y por qué importa en baloncesto formativo."),
      protocolo: z.string().min(20).describe("Ejecución paso a paso, medible en cancha con material simple."),
      justificacion: z.string().min(30).describe("Fundamento científico CON FUENTE (Vinueza / NSCA / FitnessGram / PubMed). Se anexa a la descripción."),
      sub_pilar: z.enum(SUB_PILARES_PRUEBAS),
      tren: z.enum(["superior", "inferior"]).optional().describe("Solo si la prueba es específica de un tren."),
      unidad: z.string().min(1).describe("Unidad de medida (reps, seg, cm, m, ml/kg/min…)"),
      tipo: z.enum(["mas_es_mejor", "menos_es_mejor"]),
      thresholds: z.record(z.string(), z.any()).describe("Cortes por bucket FEB, con capas opcionales de género y nivel de desarrollo. Ver generar_catalogo_pruebas."),
      inputs_requeridos: z.array(z.object({ id: z.string(), label: z.string() })).optional()
        .describe("Solo para pruebas multi-input (ej. bilateral izq/der). Default: input único en la unidad dada."),
    })).min(1).describe("Lote de pruebas a insertar"),
  },
  async ({ pruebas }) => {
    try {
      // Validación estructural de cada prueba antes de tocar la BD (todo o nada).
      for (const p of pruebas) {
        const e = validarThresholds(p.thresholds);
        if (e) throw new Error(`Prueba "${p.nombre}" — ${e}`);
      }

      const filas = pruebas.map(p => ({
        nombre: p.nombre,
        descripcion: `${p.descripcion}\n\nFundamento: ${p.justificacion}`,
        descripcion_ejecucion: p.protocolo,
        pilar: pilarDeSubPilar(p.sub_pilar),
        sub_pilar: p.sub_pilar,
        tren: p.tren ?? null,
        unidad: p.unidad,
        tipo: p.tipo,
        invertido: p.tipo === "menos_es_mejor",
        thresholds: p.thresholds,
        inputs_requeridos: p.inputs_requeridos ?? [{ id: "unico", label: `Medida en ${p.unidad}` }],
        club_id: null, // visible globalmente (club único hoy)
      }));

      const { error: insError } = await supabase.from("catalogo_ejercicios").insert(filas);
      if (insError) throw new Error("Error insertando pruebas: " + insError.message);

      let msg = `✅ ${filas.length} prueba(s) insertada(s) en catalogo_ejercicios — ya visibles en la Evaluación Científica.\n`;
      msg += filas.map(f => `- ${f.nombre} → ${f.pilar}/${f.sub_pilar} (${f.tipo}, ${f.unidad})`).join("\n");
      if (filas.some(f => f.sub_pilar === "resistencia") && !SUB_PILARES.includes("resistencia")) {
        msg += `\n\n⚠️ SIGUIENTE PASO (código): 'resistencia' ya tiene pruebas pero AÚN NO está en la taxonomía. Añadir { key: 'resistencia', label: 'Resistencia', pilar: 'fisico' } a SUB_PILARES en packages/analytics-core/taxonomia.js (el radar pasa de 7 a 8 ejes automáticamente) y correr npm run functions:sync en Dashboard_Premium.`;
      }
      return { content: [{ type: "text", text: msg }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ============================================================
// DESCRIPCIONES DEL CATÁLOGO DE PRUEBAS (espejo de las tools de
// misiones): el MCP redacta descripcion (qué mide + justificación
// científica con fuente) y descripcion_ejecucion (protocolo) para
// las pruebas de catalogo_ejercicios que no las tengan — tanto la
// batería estándar (baremo_key) como las creadas por el coach en
// NuevaPruebaModal. EvaluacionModal muestra ambos campos al
// seleccionar la prueba.
// ============================================================

const faltaTexto = (v) => v === null || v === undefined || String(v).trim() === "";

// Tool 11: Generar Descripciones de Pruebas
server.tool(
  "generar_descripciones_pruebas",
  "Lista las pruebas de catalogo_ejercicios sin descripcion y/o sin descripcion_ejecucion (batería estándar y pruebas creadas por el coach) con sus umbrales de baremo por bucket de edad como contexto, y devuelve las instrucciones para redactarlas con justificación científica. Tras redactarlas, guardarlas con actualizar_descripciones_pruebas.",
  {
    solo_baremo_key: z.boolean().optional().describe("true = limitar a la batería estándar (filas con baremo_key)"),
  },
  async ({ solo_baremo_key }) => {
    try {
      const { data: pruebas, error } = await supabase
        .from("catalogo_ejercicios")
        .select("id, nombre, baremo_key, pilar, sub_pilar, tren, unidad, invertido, thresholds, inputs_requeridos, descripcion, descripcion_ejecucion");
      if (error) throw new Error("Error consultando catalogo_ejercicios: " + error.message);

      const pendientes = (pruebas || []).filter(p =>
        (!solo_baremo_key || p.baremo_key) &&
        (faltaTexto(p.descripcion) || faltaTexto(p.descripcion_ejecucion))
      );

      if (pendientes.length === 0) {
        return { content: [{ type: "text", text: "✅ Todas las pruebas del catálogo ya tienen descripcion y descripcion_ejecucion." }] };
      }

      let prompt = `=== PRUEBAS SIN DESCRIPCIÓN COMPLETA: ${pendientes.length} ===\n`;
      pendientes.forEach(p => {
        prompt += `\n· "${p.nombre}" (id=${p.id})\n`;
        prompt += `  pilar=${p.pilar} sub_pilar=${p.sub_pilar}${p.tren ? ` tren=${p.tren}` : ""} · unidad=${p.unidad} · ${p.invertido ? "menos_es_mejor" : "mas_es_mejor"}\n`;
        if (p.inputs_requeridos) prompt += `  inputs: ${p.inputs_requeridos.map(i => i.label).join(" y ")} (el sistema promedia y alerta asimetría >15%)\n`;
        if (p.thresholds) prompt += `  umbrales por bucket: ${JSON.stringify(p.thresholds)}\n`;
        prompt += `  falta: ${[faltaTexto(p.descripcion) ? "descripcion" : null, faltaTexto(p.descripcion_ejecucion) ? "descripcion_ejecucion" : null].filter(Boolean).join(" + ")}\n`;
      });

      prompt += `
=== INSTRUCCIONES DE REDACCIÓN (mismo estándar que el catálogo de misiones) ===
Para cada prueba redacta:
- descripcion: qué capacidad mide y por qué importa en baloncesto formativo, con fundamento
  científico CON FUENTE (NSCA, FitnessGram, NBA Combine, PubMed — mismo estándar que
  packages/analytics-core/baremos_cientificos.md), y cómo puntúa: los umbrales del baremo
  dependen del bucket de edad (Sub12/Sub15/Sub18/Senior) derivado de la categoría FEB del
  atleta, y definen 5 tiers (Debe Mejorar → Excelente) que alimentan el overall del pilar.
- descripcion_ejecucion: protocolo ejecutable paso a paso por el coach (posición inicial,
  criterio de repetición/medida válida, intentos y qué valor registrar, en la unidad indicada).
Texto plano, 2-4 frases por campo, en español.

Cuando tengas el lote redactado, llama a actualizar_descripciones_pruebas. Por defecto solo
rellena campos vacíos (nunca pisa texto ya escrito por el coach).`;

      return { content: [{ type: "text", text: prompt }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 12: Actualizar Descripciones de Pruebas
server.tool(
  "actualizar_descripciones_pruebas",
  "Guarda en lote descripcion y/o descripcion_ejecucion de pruebas de catalogo_ejercicios. Solo escribe esos dos campos (jamás los campos científicos del sync) y por defecto solo rellena los que estén vacíos; sobrescribir=true permite reemplazar texto existente.",
  {
    pruebas: z.array(z.object({
      id: z.string().uuid(),
      descripcion: z.string().min(20).optional(),
      descripcion_ejecucion: z.string().min(20).optional(),
    })).min(1).describe("Lote de pruebas con los textos redactados"),
    sobrescribir: z.boolean().optional().describe("true = permite reemplazar textos no vacíos (default false)"),
  },
  async ({ pruebas, sobrescribir }) => {
    try {
      const resultados = [];
      for (const p of pruebas) {
        if (!p.descripcion && !p.descripcion_ejecucion) {
          resultados.push(`⚠️ ${p.id}: sin campos que actualizar, omitida.`);
          continue;
        }

        const { data: actual, error: readError } = await supabase
          .from("catalogo_ejercicios")
          .select("id, nombre, descripcion, descripcion_ejecucion")
          .eq("id", p.id)
          .single();
        if (readError || !actual) {
          resultados.push(`❌ ${p.id}: no encontrada (${readError?.message ?? "sin fila"}).`);
          continue;
        }

        const cambios = {};
        if (p.descripcion && (sobrescribir || faltaTexto(actual.descripcion))) cambios.descripcion = p.descripcion;
        if (p.descripcion_ejecucion && (sobrescribir || faltaTexto(actual.descripcion_ejecucion))) cambios.descripcion_ejecucion = p.descripcion_ejecucion;

        if (Object.keys(cambios).length === 0) {
          resultados.push(`⏭️ "${actual.nombre}": campos ya escritos, no se pisan (usa sobrescribir=true si es intencional).`);
          continue;
        }

        const { error: upError } = await supabase
          .from("catalogo_ejercicios")
          .update(cambios)
          .eq("id", p.id);
        if (upError) {
          resultados.push(`❌ "${actual.nombre}": ${upError.message}`);
          continue;
        }
        resultados.push(`✅ "${actual.nombre}": ${Object.keys(cambios).join(" + ")}`);
      }

      return { content: [{ type: "text", text: resultados.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Black Gold MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
