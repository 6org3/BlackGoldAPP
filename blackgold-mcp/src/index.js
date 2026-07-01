import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { calcularCategoriaFEB } from "../../packages/analytics-core/categoriaFEB.js";

dotenv.config();

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Black Gold MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
