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
// → 429 { error } al agotar la cuota diaria por usuario (consumir_cuota_copiloto, v53)
//
// Tono por rol (blueprint §4.4): técnico para coach/owner/superadmin (cifras,
// unidades, procedencia) y simple para atleta/padre (lenguaje llano, sin jerga
// ni números /100). Misma inteligencia y fuentes; cambia la capa de lenguaje.
//
// El rack documental corre AQUÍ con el motor portable (rackMotor.js) y el
// corpus pre-generado (rack-corpus.generado.js, `npm run functions:sync`):
// mismo índice BM25 que el MCP, sin tocar disco. El proveedor del LLM es
// configurable (COPILOTO_FORMATO / _API_KEY / _BASE_URL / _MODEL, con Anthropic
// y ANTHROPIC_API_KEY como default); la clave vive siempre en los secrets de la
// función — jamás en el bundle del cliente.

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
import { leerLimite } from "../_shared/controlAbuso.ts";
import { analizarPilares } from "../_shared/brain-core/diagnostico.js";
import { analizarReadiness } from "../_shared/brain-core/readiness.js";
import { construirIndiceRack } from "../_shared/brain-core/rackMotor.js";
import { CORPUS } from "../_shared/brain-core/rack-corpus.generado.js";

// Índice BM25 del rack: se construye UNA vez por instancia de la función
// (el corpus viaja serializado en el bundle; ~cientos de KB, milisegundos).
const INDICE_RACK = construirIndiceRack(CORPUS);

// Proveedor del LLM. El default es Anthropic nativo (COPILOTO_FORMATO ausente o
// con cualquier valor desconocido): es el camino probado y el que está
// desplegado, así que un typo en la variable degrada al comportamiento actual en
// vez de romper el copiloto. 'openai' habla el dialecto OpenAI-compatible, que
// por defecto apunta a DeepSeek.
//
// Con DeepSeek hay que quedarse en 'deepseek-chat': 'deepseek-reasoner' NO
// soporta function calling, y aquí todo el valor sale de las tools (rack,
// diagnóstico, readiness) — sin ellas el copiloto solo puede alucinar.
//
// Aviso de privacidad: el hilo lleva datos de menores (nombres, evaluaciones,
// sueño y fatiga) y viaja íntegro al proveedor que se configure. Anthropic no
// entrena con datos de API por defecto; DeepSeek procesa en China y varios
// proveedores OpenAI-compatible sí entrenan con el tráfico de su API. Elegir
// proveedor es decisión del dueño del club, no de esta función.
const API_ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const API_OPENAI = 'https://api.deepseek.com/chat/completions';
const MODELO_DEFAULT = 'claude-haiku-4-5';
const MODELO_OPENAI_DEFAULT = 'deepseek-chat';
const ROLES_DEFAULT = 'superadmin,owner,coach,atleta,padre';
const MAX_MENSAJES = 20;
const MAX_CHARS_MENSAJE = 2000;
const MAX_ITERACIONES = 5; // vueltas del loop LLM ↔ tools
const MAX_TOKENS = 1024;   // respuestas cortas: es un chat móvil
const LIMITE_DIA_DEFAULT = 30; // mensajes por usuario/día (ajustable: COPILOTO_LIMITE_DIA)

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
// Capa de proveedor: un solo punto de salida hacia el LLM
// --------------------------------------------------------------
//
// La representación INTERNA del hilo es siempre la de Anthropic (bloques
// tool_use / tool_result). El dialecto OpenAI se traduce en la frontera, a la
// ida y a la vuelta, para que el loop del handler, los ejecutores de
// herramientas y el contrato de respuesta no sepan qué proveedor hay detrás:
// un formato nuevo se agrega aquí y en ningún otro sitio.

type BloqueAnthropic = {
  type: string;
  text?: string;
  // Bloques tool_use (turno del assistant).
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // Bloques tool_result (turno del user).
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
};

type RespuestaLLM = {
  stop_reason?: string;
  content?: BloqueAnthropic[];
  usage?: unknown;
};

type MensajeHilo = { role: string; content: unknown };

type HerramientaAnthropic = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type ConfigLLM = {
  formato: 'anthropic' | 'openai';
  apiKey: string;
  baseUrl: string;
  modelo: string;
};

// Una variable en blanco es un descuido de configuración, no un valor: se trata
// como ausente para que caiga en el default en vez de armar una URL rota o
// mandar una clave vacía (y un salto de línea pegado por error se va con trim).
function envTexto(nombre: string): string | undefined {
  const v = Deno.env.get(nombre)?.trim();
  return v ? v : undefined;
}

// Devuelve null si no hay clave: el handler traduce eso al 503 de siempre.
function leerConfigLLM(): ConfigLLM | null {
  const formato: ConfigLLM['formato'] =
    envTexto('COPILOTO_FORMATO')?.toLowerCase() === 'openai' ? 'openai' : 'anthropic';

  // El fallback a ANTHROPIC_API_KEY existe solo en el formato nativo: es la
  // variable que ya está desplegada y funcionando. En formato openai sería peor
  // que inútil — mandaría la clave de Anthropic a otro proveedor.
  const apiKey = envTexto('COPILOTO_API_KEY')
    ?? (formato === 'anthropic' ? envTexto('ANTHROPIC_API_KEY') : undefined);
  if (!apiKey) return null;

  return {
    formato,
    apiKey,
    baseUrl: envTexto('COPILOTO_BASE_URL') ?? (formato === 'openai' ? API_OPENAI : API_ANTHROPIC),
    modelo: envTexto('COPILOTO_MODEL') ?? (formato === 'openai' ? MODELO_OPENAI_DEFAULT : MODELO_DEFAULT),
  };
}

// Ida: hilo interno → messages OpenAI-compatible.
function aMensajesOpenAI(system: string, mensajes: MensajeHilo[]): Array<Record<string, unknown>> {
  // En este dialecto el system no es un campo aparte: es el primer mensaje.
  const salida: Array<Record<string, unknown>> = [{ role: 'system', content: system }];

  for (const m of mensajes) {
    if (typeof m.content === 'string') {
      salida.push({ role: m.role, content: m.content });
      continue;
    }
    const bloques = Array.isArray(m.content) ? (m.content as BloqueAnthropic[]) : [];

    if (m.role === 'assistant') {
      const texto = bloques.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
      const llamadas = bloques
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      // content null (no cadena vacía) cuando el turno fue solo tool_calls: es
      // lo que devuelven estos proveedores y lo que sus validadores esperan.
      const mensaje: Record<string, unknown> = { role: 'assistant', content: texto || null };
      if (llamadas.length) mensaje.tool_calls = llamadas;
      salida.push(mensaje);
      continue;
    }

    // Turno user con bloques = los tool_result. Anthropic los agrupa en UN
    // mensaje; aquí va uno por bloque, cada uno atado a su tool_call_id y en el
    // mismo orden en que se pidieron.
    for (const b of bloques) {
      const cuerpo = b.content ?? '';
      salida.push({
        role: 'tool',
        tool_call_id: b.tool_use_id,
        // No hay flag is_error en este dialecto: el fallo se marca en el texto
        // para que el modelo lo lea como error y no como dato bueno.
        content: b.is_error ? `[error] ${cuerpo}` : cuerpo,
      });
    }
  }
  return salida;
}

function aToolsOpenAI(tools: HerramientaAnthropic[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

type RespuestaOpenAI = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
  }>;
  usage?: unknown;
};

// Vuelta: respuesta OpenAI-compatible → la forma Anthropic que espera el loop.
function deRespuestaOpenAI(json: RespuestaOpenAI): RespuestaLLM {
  const mensaje = json.choices?.[0]?.message;
  const finish = json.choices?.[0]?.finish_reason;

  const bloques: BloqueAnthropic[] = [];
  if (typeof mensaje?.content === 'string' && mensaje.content) {
    bloques.push({ type: 'text', text: mensaje.content });
  }
  for (const llamada of mensaje?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(llamada.function?.arguments || '{}') as Record<string, unknown>;
    } catch {
      // Argumentos malformados: se ejecuta la herramienta con input vacío y que
      // ella devuelva su propio error de validación por el canal normal. Tumbar
      // toda la petición por el JSON de un proveedor sería peor.
      input = {};
    }
    bloques.push({ type: 'tool_use', id: llamada.id, name: llamada.function?.name, input });
  }

  const hayTools = bloques.some((b) => b.type === 'tool_use');
  return {
    // El loop corta por stop_reason, así que la traducción tiene que ser fiel:
    // tool_calls presentes mandan sobre el finish_reason.
    stop_reason: hayTools ? 'tool_use' : (finish === 'length' ? 'max_tokens' : 'end_turn'),
    content: bloques,
    usage: json.usage,
  };
}

// Único fetch hacia el proveedor. El detalle del fallo va al log y al cliente le
// llega siempre el mismo 502 en español: el cuerpo de error de un proveedor
// puede delatar cabeceras, organización o cuenta.
async function llamarLLM(
  cfg: ConfigLLM,
  system: string,
  mensajes: MensajeHilo[],
  tools: HerramientaAnthropic[],
): Promise<{ ok: true; respuesta: RespuestaLLM } | { ok: false; error: Response }> {
  const falla502 = () =>
    jsonResponse({ error: 'El copiloto no pudo responder. Intenta de nuevo en unos minutos.' }, 502);

  const esOpenAI = cfg.formato === 'openai';
  const headers: Record<string, string> = esOpenAI
    ? { 'Authorization': `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' }
    : { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  const body = esOpenAI
    ? { model: cfg.modelo, max_tokens: MAX_TOKENS, messages: aMensajesOpenAI(system, mensajes), tools: aToolsOpenAI(tools) }
    : { model: cfg.modelo, max_tokens: MAX_TOKENS, system, messages: mensajes, tools };

  let r: Response;
  try {
    r = await fetch(cfg.baseUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (err) {
    console.error(`[copiloto] fallo de red hacia el proveedor (${cfg.formato}):`, err instanceof Error ? err.message : err);
    return { ok: false, error: falla502() };
  }
  if (!r.ok) {
    console.error(`[copiloto] error del proveedor (${cfg.formato}):`, r.status, (await r.text()).slice(0, 500));
    return { ok: false, error: falla502() };
  }

  const json = await r.json();
  return { ok: true, respuesta: esOpenAI ? deRespuestaOpenAI(json as RespuestaOpenAI) : (json as RespuestaLLM) };
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
  const cfg = leerConfigLLM();
  if (!cfg) return jsonResponse({ error: 'El copiloto no está configurado todavía.' }, 503);

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

  // 5. Cuota diaria por usuario (consumir_cuota_copiloto, v53): consumo ATÓMICO
  // antes de tocar la API de pago — sin esto, cualquier cuenta autenticada puede
  // quemar ANTHROPIC_API_KEY en bucle. Va DESPUÉS de validar el body para que
  // una petición malformada (400) no gaste cuota, y es fail-closed: sin
  // veredicto de la base no hay LLM. El umbral se ajusta por entorno sin
  // redesplegar, mismo patrón que los límites de registro-publico.
  const limiteDia = leerLimite('COPILOTO_LIMITE_DIA', LIMITE_DIA_DEFAULT);
  const { data: cuota, error: eCuota } = await admin.rpc('consumir_cuota_copiloto', {
    p_usuario_id: caller.id,
    p_limite: limiteDia,
  });
  const veredicto = cuota as { permitido?: boolean; usados?: number; limite?: number } | null;
  if (eCuota || typeof veredicto?.permitido !== 'boolean') {
    console.error('[copiloto] cuota no verificable:', eCuota?.message ?? JSON.stringify(cuota));
    return jsonResponse({ error: 'El copiloto no está disponible en este momento. Intenta de nuevo en unos minutos.' }, 503);
  }
  if (!veredicto.permitido) {
    return jsonResponse({
      error: `Alcanzaste el límite diario del copiloto (${veredicto.limite ?? limiteDia} mensajes). Se reinicia mañana.`,
    }, 429);
  }

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

  // 6. Loop LLM ↔ tools (máx MAX_ITERACIONES vueltas). El hilo se mantiene
  // siempre en la forma Anthropic: llamarLLM traduce en la frontera si el
  // proveedor configurado habla el dialecto OpenAI.
  const herramientasUsadas = new Set<string>();
  let respuesta: RespuestaLLM | null = null;

  for (let iteracion = 0; iteracion < MAX_ITERACIONES; iteracion++) {
    const llamada = await llamarLLM(cfg, system, mensajes, tools);
    if (!llamada.ok) return llamada.error;
    respuesta = llamada.respuesta;

    // Observabilidad de costo: usage por iteración en los logs de la función.
    console.log(`[copiloto] rol=${caller.rol} formato=${cfg.formato} modelo=${cfg.modelo} iteracion=${iteracion} stop=${respuesta?.stop_reason} usage=${JSON.stringify(respuesta?.usage ?? {})}`);

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

  // 7. Respuesta final: concatenar los bloques de texto.
  let texto = (respuesta?.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
    .trim();

  // 'refusal' es un stop_reason propio de Anthropic (la traducción del dialecto
  // openai nunca lo emite); se mantiene porque el default sigue siendo nativo.
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
    modelo: cfg.modelo,
  }, 200);
});
