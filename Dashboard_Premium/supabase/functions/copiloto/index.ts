// Edge Function: copiloto — chat conversacional con function-calling (Vía C).
//
// PR6 del rediseño frontend por rol (docs/blueprint_rediseno_frontend.md §4.4,
// docs/handoff_implementacion.md §5-PR6): el cliente NUNCA habla con el LLM
// directo — envía el hilo aquí, esta función valida JWT + rol + club
// (_shared/brainAuth.ts, el mismo módulo que brain-gateway), fija la
// superficie de herramientas de ese rol y orquesta el loop Messages API ↔
// tools de brain-core con las lecturas a Supabase hechas server-side.
//
// POST /copiloto  body: { mensajes: [{role:'user'|'assistant', content}], atleta_id? }
// → { respuesta, tono: 'simple'|'tecnico', herramientas_usadas, modelo }
//
// Tono por rol (blueprint §4.4): técnico para coach/owner/superadmin (cifras,
// unidades, procedencia) y simple para atleta/padre (lenguaje llano, sin jerga
// ni números /100). Misma inteligencia y fuentes; cambia la capa de lenguaje.
//
// El rack documental corre AQUÍ con el motor portable (rackMotor.js) y el
// corpus pre-generado (rack-corpus.generado.js, `npm run functions:sync`):
// mismo índice BM25 que el MCP, sin tocar disco. ANTHROPIC_API_KEY vive en
// los secrets de la función — jamás en el bundle del cliente.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  autenticar,
  fueraDeAlcance,
  jsonResponse,
  obtenerAtleta,
  ROLES_STAFF,
  type AdminClient,
  type Caller,
  type Target,
} from "../_shared/brainAuth.ts";
import { analizarPilares } from "../_shared/brain-core/diagnostico.js";
import { analizarReadiness } from "../_shared/brain-core/readiness.js";
import { construirIndiceRack } from "../_shared/brain-core/rackMotor.js";
import { CORPUS } from "../_shared/brain-core/rack-corpus.generado.js";

// Índice BM25 del rack: se construye UNA vez por instancia de la función
// (el corpus viaja serializado en el bundle; ~cientos de KB, milisegundos).
const INDICE_RACK = construirIndiceRack(CORPUS);

const API_ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MODELO_DEFAULT = 'claude-haiku-4-5';
const ROLES_DEFAULT = 'superadmin,owner,coach,atleta,padre';
const MAX_MENSAJES = 20;
const MAX_CHARS_MENSAJE = 2000;
const MAX_ITERACIONES = 5; // vueltas del loop LLM ↔ tools
const MAX_TOKENS = 1024;   // respuestas cortas: es un chat móvil

// --------------------------------------------------------------
// Herramientas (Anthropic tools) — superficie POR ROL
// --------------------------------------------------------------

const TOOL_CONSULTAR_RACK = {
  name: 'consultar_rack',
  description: 'Busca en el rack documental del club (metodología de iniciación, baremos científicos, entrenamiento, táctica, mentalidad, referencias académicas). Úsala para fundamentar cualquier recomendación o explicación metodológica en las fuentes internas del club.',
  input_schema: {
    type: 'object',
    properties: {
      consulta: { type: 'string', description: 'Consulta de búsqueda en español (p.ej. "umbrales CMJ por edad").' },
    },
    required: ['consulta'],
  },
};

const TOOL_DIAGNOSTICO = {
  name: 'diagnostico_atleta',
  description: 'Diagnóstico de rendimiento del atleta: promedio 0-100 y tier por sub-pilar (fuerza, explosividad, tiro, etc.) más las debilidades priorizadas, calculado con sus últimas 20 evaluaciones.',
  input_schema: {
    type: 'object',
    properties: {
      atleta_id: { type: 'string', description: 'UUID del atleta. Opcional: si quien pregunta es un atleta se usa siempre su propia ficha; si es un padre con un solo hijo, la de ese hijo.' },
    },
  },
};

const TOOL_READINESS = {
  name: 'readiness_atleta',
  description: 'Estado de recuperación del atleta: su último check-in diario (sueño, fatiga, hidratación), el score de readiness, los déficits activos y las misiones de recuperación recomendadas.',
  input_schema: {
    type: 'object',
    properties: {
      atleta_id: { type: 'string', description: 'UUID del atleta. Opcional con las mismas reglas que diagnostico_atleta.' },
    },
  },
};

const TOOL_LISTAR_ATLETAS = {
  name: 'listar_atletas',
  description: 'Lista los atletas dentro del alcance del usuario (su club; si es coach, además su categoría) con id, nombre, categoría FEB y overall. Úsala para resolver nombres a atleta_id antes de pedir diagnósticos.',
  input_schema: { type: 'object', properties: {} },
};

function herramientasParaRol(rol: string) {
  const base = [TOOL_CONSULTAR_RACK, TOOL_DIAGNOSTICO, TOOL_READINESS];
  return ROLES_STAFF.has(rol) ? [...base, TOOL_LISTAR_ATLETAS] : base;
}

// --------------------------------------------------------------
// Resolución de alcance de atleta (por rol, ANTES de leer datos)
// --------------------------------------------------------------

const SELECT_ATLETA = 'id, usuario_id, estado_recuperacion, usuarios!inner!atletas_usuario_id_fkey(id, nombre, fecha_nacimiento, club, categoria_feb)';

// atleta → SIEMPRE el propio (ignora atleta_id ajeno); padre → hijo vinculado
// en padres_atletas (si tiene uno solo, ese por defecto); staff → el pedido,
// validado con fueraDeAlcance. Devuelve { target } o { error } (texto para
// el tool_result — nunca filtra datos de otros clubes/familias).
async function resolverAtleta(
  admin: AdminClient,
  caller: Caller,
  atletaId: string | null,
): Promise<{ target?: Target; error?: string }> {
  if (caller.rol === 'atleta') {
    const { data } = await admin
      .from('atletas')
      .select(SELECT_ATLETA)
      .eq('usuario_id', caller.id)
      .maybeSingle();
    if (!data) return { error: 'No encontré tu ficha de atleta. Avisa a tu coach para que revise tu registro.' };
    return { target: data as unknown as Target };
  }

  if (caller.rol === 'padre') {
    const { data: vinculos } = await admin
      .from('padres_atletas')
      .select('atleta_id')
      .eq('padre_id', caller.id);
    const hijos = (vinculos ?? []).map((v: { atleta_id: string }) => v.atleta_id);
    if (hijos.length === 0) return { error: 'No tienes atletas vinculados a tu cuenta. Pide al club que vincule a tu hijo/a.' };
    let elegido = atletaId;
    if (!elegido) {
      if (hijos.length === 1) elegido = hijos[0];
      else return { error: 'Tienes más de un atleta vinculado: indica de cuál hijo/a quieres saber.' };
    }
    if (!hijos.includes(elegido)) return { error: 'Solo puedes consultar a tus hijos.' };
    const res = await obtenerAtleta(admin, elegido);
    if (res.error || !res.target) return { error: 'Atleta no encontrado.' };
    return { target: res.target };
  }

  // Staff (superadmin/owner/coach): necesita un atleta_id explícito.
  if (!atletaId) return { error: 'Falta el atleta_id. Usa listar_atletas para resolver el nombre a su id.' };
  const res = await obtenerAtleta(admin, atletaId);
  if (res.error || !res.target) return { error: 'Atleta no encontrado.' };
  const rechazo = await fueraDeAlcance(admin, caller, res.target);
  if (rechazo) return { error: rechazo };
  return { target: res.target };
}

// --------------------------------------------------------------
// Ejecutores de herramientas (cada error vuelve como tool_result is_error)
// --------------------------------------------------------------

function ejecutarConsultarRack(input: Record<string, unknown>): string {
  const consulta = String(input?.consulta ?? '').trim();
  if (!consulta) throw new Error('Falta la consulta de búsqueda.');
  const hits = INDICE_RACK.buscar(consulta, { k: 3 });
  if (!hits.length) return 'El rack documental del club no tiene resultados para esa consulta.';
  return hits
    .map((h: { archivo: string; seccion: string; texto: string }) => `[${h.archivo} › ${h.seccion}]\n${h.texto}`)
    .join('\n\n');
}

async function ejecutarDiagnostico(
  admin: AdminClient,
  caller: Caller,
  input: Record<string, unknown>,
): Promise<string> {
  const alcance = await resolverAtleta(admin, caller, typeof input?.atleta_id === 'string' ? input.atleta_id : null);
  if (alcance.error || !alcance.target) throw new Error(alcance.error ?? 'Atleta no encontrado.');
  const target = alcance.target;

  const { data: evaluaciones, error } = await admin
    .from('evaluaciones_pruebas')
    .select('*')
    .eq('atleta_id', target.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error('No pude leer las evaluaciones del atleta.');

  const analisis = analizarPilares({ atleta: target.usuarios, evaluaciones: evaluaciones || [] });
  // Las notas subjetivas del coach son cuaderno interno: solo staff las ve
  // (mismo criterio que brain-gateway, blueprint §4.4).
  if (!ROLES_STAFF.has(caller.rol)) delete (analisis as { notasSubjetivas?: unknown }).notasSubjetivas;
  return JSON.stringify({
    atleta: { id: target.id, nombre: target.usuarios.nombre },
    evaluaciones_consideradas: (evaluaciones || []).length,
    ...analisis,
  });
}

async function ejecutarReadiness(
  admin: AdminClient,
  caller: Caller,
  input: Record<string, unknown>,
): Promise<string> {
  const alcance = await resolverAtleta(admin, caller, typeof input?.atleta_id === 'string' ? input.atleta_id : null);
  if (alcance.error || !alcance.target) throw new Error(alcance.error ?? 'Atleta no encontrado.');
  const target = alcance.target;

  const [resCheckin, resMisiones] = await Promise.all([
    admin
      .from('atleta_readiness')
      .select('sueno_calidad, fatiga_fisica, color_orina, fecha')
      .eq('atleta_id', target.id)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('misiones')
      .select('id, titulo, condicion_trigger, complejidad, xp_recompensa, activa, pilar')
      .eq('activa', true)
      .eq('pilar', 'recuperacion'),
  ]);
  const readiness = resCheckin.data ?? null;
  const misiones = resMisiones.data ?? [];

  const analisis = analizarReadiness({
    readiness,
    estadoRecuperacion: target.estado_recuperacion,
    misiones,
  });
  return JSON.stringify({
    atleta: { id: target.id, nombre: target.usuarios.nombre },
    ultimo_checkin: readiness,
    estado_recuperacion: target.estado_recuperacion ?? null,
    ...analisis,
  });
}

async function ejecutarListarAtletas(admin: AdminClient, caller: Caller): Promise<string> {
  if (!ROLES_STAFF.has(caller.rol)) throw new Error('Solo el staff puede listar atletas.');
  let query = admin
    .from('atletas')
    .select('id, overall_score, usuarios!inner!atletas_usuario_id_fkey(nombre, categoria_feb, club)')
    .limit(100);
  if (caller.club) query = query.eq('usuarios.club', caller.club);
  if (caller.rol === 'coach' && caller.categoria && caller.categoria !== 'Todas') {
    query = query.eq('usuarios.categoria_feb', caller.categoria);
  }
  const { data, error } = await query;
  if (error) throw new Error('No pude listar los atletas.');
  const atletas = (data || []).map((a: { id: string; overall_score: number | null; usuarios: { nombre: string; categoria_feb: string | null } }) => ({
    id: a.id,
    nombre: a.usuarios?.nombre ?? null,
    categoria_feb: a.usuarios?.categoria_feb ?? null,
    overall_score: a.overall_score ?? null,
  }));
  return JSON.stringify({ total: atletas.length, atletas });
}

async function ejecutarHerramienta(
  nombre: string,
  input: Record<string, unknown>,
  ctx: { admin: AdminClient; caller: Caller },
): Promise<string> {
  switch (nombre) {
    case 'consultar_rack': return ejecutarConsultarRack(input);
    case 'diagnostico_atleta': return await ejecutarDiagnostico(ctx.admin, ctx.caller, input);
    case 'readiness_atleta': return await ejecutarReadiness(ctx.admin, ctx.caller, input);
    case 'listar_atletas': return await ejecutarListarAtletas(ctx.admin, ctx.caller);
    default: throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

// --------------------------------------------------------------
// System prompt: base común + registro por rol (blueprint §4.4)
// --------------------------------------------------------------

function construirSystem(caller: Caller, tono: 'simple' | 'tecnico'): string {
  const quien = [
    `rol ${caller.rol}`,
    caller.club ? `club ${caller.club}` : null,
    caller.rol === 'coach' && caller.categoria ? `categoría ${caller.categoria}` : null,
  ].filter(Boolean).join(', ');

  const base = `Eres el Copiloto Black Gold, el asistente del club de baloncesto formativo Black Gold (Sucumbíos, Ecuador).
Hablas con ${caller.nombre ?? 'un usuario'} (${quien}).
Reglas:
- Respondes SIEMPRE en español.
- Respondes SOLO sobre baloncesto formativo, la metodología del club y los atletas dentro del alcance de este usuario. Si te preguntan otra cosa (u otro atleta/club fuera de su alcance), dilo sin rodeos y no inventes datos.
- Cuando uses el rack documental, cita la fuente como [archivo › sección].
- Respuestas cortas y directas: esto es un chat móvil. Ve al grano.
- Si una herramienta devuelve un error o no hay datos, explícalo con honestidad en vez de rellenar con suposiciones.`;

  const tecnico = `
Registro TÉCNICO (staff): usa cifras, unidades y terminología deportiva (CMJ en cm, sRPE, tiers, scores /100). Cuando un dato venga de una herramienta, menciona la procedencia (p.ej. "según diagnostico_atleta" o la fuente del rack). Prioriza lo accionable para el entrenamiento.`;

  const simple = caller.rol === 'padre'
    ? `
Registro SIMPLE (familia): lenguaje llano y cálido, sin jerga, sin tiers ni números sobre 100 y sin nombres de herramientas. Traduce los datos a frases que cualquier madre o padre entienda ("va muy bien en agilidad, y el coach le está ayudando con el salto"). Tono tranquilizador: si no hay señales de riesgo, dilo con claridad.`
    : `
Registro SIMPLE (atleta): lenguaje llano y cercano, sin jerga, sin tiers ni números sobre 100 y sin nombres de herramientas. Habla directo al atleta ("saltar más alto es lo que más te va a ayudar ahora"). Tono motivador: celebra el progreso y da un siguiente paso concreto.`;

  return base + (tono === 'tecnico' ? tecnico : simple);
}

// --------------------------------------------------------------
// Validación del body
// --------------------------------------------------------------

type MensajeCliente = { role: 'user' | 'assistant'; content: string };

function validarMensajes(mensajes: unknown): string | null {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return 'Falta el hilo de mensajes.';
  if (mensajes.length > MAX_MENSAJES) return `El hilo supera los ${MAX_MENSAJES} mensajes: recórtalo a los más recientes.`;
  for (const m of mensajes) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return "Cada mensaje debe tener role 'user' o 'assistant'.";
    if (typeof m.content !== 'string' || !m.content.trim()) return 'Cada mensaje debe tener content de texto no vacío.';
    if (m.content.length > MAX_CHARS_MENSAJE) return `Un mensaje supera los ${MAX_CHARS_MENSAJE} caracteres.`;
  }
  // La Messages API exige abrir con 'user' y aquí cerrar con 'user' (la
  // pregunta nueva); mejor un 400 claro que un 502 opaco río abajo.
  if ((mensajes[0] as MensajeCliente).role !== 'user') return 'El primer mensaje debe ser del usuario.';
  if ((mensajes[mensajes.length - 1] as MensajeCliente).role !== 'user') return 'El último mensaje debe ser del usuario.';
  return null;
}

// --------------------------------------------------------------
// Handler
// --------------------------------------------------------------

serve(async (req) => {
  // 1. Identidad + perfil (compartido con brain-gateway).
  const auth = await autenticar(req);
  if (auth.error) return auth.error;
  const caller = auth.caller!;
  const admin = auth.admin!;

  // 2. Gating por rol (Vía C consume tokens: se puede acotar por env sin deploy).
  const rolesPermitidos = (Deno.env.get('COPILOTO_ROLES') ?? ROLES_DEFAULT)
    .split(',').map((r) => r.trim()).filter(Boolean);
  if (!rolesPermitidos.includes(caller.rol)) {
    return jsonResponse({ error: 'El copiloto aún no está disponible para tu rol. Pronto lo estará.' }, 403);
  }

  // 3. Configuración del LLM (secrets de la función, nunca del cliente).
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'El copiloto no está configurado todavía.' }, 503);
  const modelo = Deno.env.get('COPILOTO_MODEL') ?? MODELO_DEFAULT;

  // 4. Body: hilo de mensajes (+ atleta de contexto opcional).
  let body: { mensajes?: unknown; atleta_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
  }
  const invalido = validarMensajes(body?.mensajes);
  if (invalido) return jsonResponse({ error: invalido }, 400);
  const atletaContexto = typeof body?.atleta_id === 'string' && body.atleta_id ? body.atleta_id : null;

  const tono: 'simple' | 'tecnico' = ROLES_STAFF.has(caller.rol) ? 'tecnico' : 'simple';
  const system = construirSystem(caller, tono);
  const tools = herramientasParaRol(caller.rol);

  // Hilo para la API (solo role/content ya validados). Si el cliente abrió el
  // copiloto desde la ficha de un atleta, ese contexto viaja como apunte del
  // primer turno (las tools igualmente re-validan el alcance server-side).
  const mensajes: Array<{ role: string; content: unknown }> = (body.mensajes as MensajeCliente[])
    .map((m) => ({ role: m.role, content: m.content }));
  if (atletaContexto) {
    mensajes[0] = {
      role: mensajes[0].role,
      content: `[Contexto de la app: la conversación se abrió sobre el atleta con atleta_id=${atletaContexto}.]\n${mensajes[0].content}`,
    };
  }

  // 5. Loop Messages API ↔ tools (máx MAX_ITERACIONES vueltas).
  const herramientasUsadas = new Set<string>();
  let respuesta: {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    usage?: unknown;
  } | null = null;

  for (let iteracion = 0; iteracion < MAX_ITERACIONES; iteracion++) {
    let r: Response;
    try {
      r = await fetch(API_ANTHROPIC, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: modelo, max_tokens: MAX_TOKENS, system, messages: mensajes, tools }),
      });
    } catch (err) {
      console.error('[copiloto] fallo de red hacia la API de Anthropic:', err instanceof Error ? err.message : err);
      return jsonResponse({ error: 'El copiloto no pudo responder. Intenta de nuevo en unos minutos.' }, 502);
    }
    if (!r.ok) {
      // Nunca reenviar el detalle al cliente (podría filtrar cabeceras/cuenta);
      // al log sí, para diagnosticar.
      console.error('[copiloto] error de la API de Anthropic:', r.status, (await r.text()).slice(0, 500));
      return jsonResponse({ error: 'El copiloto no pudo responder. Intenta de nuevo en unos minutos.' }, 502);
    }
    respuesta = await r.json();

    // Observabilidad de costo: usage por iteración en los logs de la función.
    console.log(`[copiloto] rol=${caller.rol} modelo=${modelo} iteracion=${iteracion} stop=${respuesta?.stop_reason} usage=${JSON.stringify(respuesta?.usage ?? {})}`);

    if (respuesta?.stop_reason !== 'tool_use') break;

    // Ejecutar TODOS los tool_use del turno (en paralelo) y devolver TODOS
    // los tool_result en UN SOLO mensaje user (contrato de la Messages API).
    const bloquesTool = (respuesta.content ?? []).filter((b) => b.type === 'tool_use');
    const resultados = await Promise.all(bloquesTool.map(async (bloque) => {
      herramientasUsadas.add(bloque.name ?? '');
      try {
        const texto = await ejecutarHerramienta(bloque.name ?? '', bloque.input ?? {}, { admin, caller });
        return { type: 'tool_result', tool_use_id: bloque.id, content: texto };
      } catch (err) {
        return {
          type: 'tool_result',
          tool_use_id: bloque.id,
          content: err instanceof Error ? err.message : 'Error al ejecutar la herramienta.',
          is_error: true,
        };
      }
    }));
    mensajes.push({ role: 'assistant', content: respuesta.content });
    mensajes.push({ role: 'user', content: resultados });
  }

  // 6. Respuesta final: concatenar los bloques de texto.
  let texto = (respuesta?.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
    .trim();

  if (respuesta?.stop_reason === 'refusal') {
    texto = 'No puedo ayudarte con esa consulta. Si crees que es un error, replantea la pregunta sobre el baloncesto o los atletas del club.';
  } else if (!texto) {
    texto = respuesta?.stop_reason === 'tool_use'
      ? 'Necesité demasiadas consultas para responder eso. Intenta con una pregunta más concreta.'
      : 'No pude generar una respuesta. Intenta reformular la pregunta.';
  }

  return jsonResponse({
    respuesta: texto,
    tono,
    herramientas_usadas: [...herramientasUsadas].filter(Boolean),
    modelo,
  }, 200);
});
