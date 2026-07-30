// ============================================================================
// blackgold-negocio-mcp — servidor MCP de NEGOCIO de Black Gold.
//
// Hermano de blackgold-mcp (18 tools, 100% analítica deportiva): este server
// expone leads, cobranza, KPIs de dirección y gastos — el hueco de negocio
// que blackgold-mcp no cubre (ver "Punto de Partida — Black Gold.md" §6).
//
// Mismo patrón que blackgold-mcp: proceso Node por stdio, Supabase con la
// service_role key (con RLS real desde v24 la anon key no puede leer/escribir
// ninguna tabla), tools finas que reutilizan las consultas y reglas de los
// *Service.js de Dashboard_Premium/src/api en vez de inventar las suyas.
//
// DISCREPANCIAS conocidas entre la especificación (§6) y el esquema real
// (documentadas también en el reporte de construcción):
//   1. No existe una tabla `solicitudes_registro`. Los leads son filas de
//      `usuarios` (rol='atleta') con `usuarios.estado` en
//      ('pendiente','activo','rechazado') — columna añadida en v33. La
//      aprobación/rechazo la resuelve la RPC `resolver_solicitud_registro`.
//   2. `usuarios` no tiene `updated_at`: no hay forma exacta de medir
//      "tiempo hasta la decisión". Se usa `atletas.fecha_alta` como proxy
//      (v33 la fija a `current_date` en el momento exacto de la aprobación),
//      así que el tiempo de conversión es una aproximación, no un dato exacto.
//   3. `pagos` no tiene columna `club` propia: el club se deriva SIEMPRE vía
//      `atletas.usuario_id -> usuarios.club` (igual que hace pagosService.js).
//   4. Las funciones fn_retencion_club/fn_ocupacion_cancha (v31/v32) son
//      SECURITY DEFINER pero gatean internamente por `es_staff()`/
//      `current_user_club()`, que leen `auth.uid()`. Este servidor corre con
//      la service_role key (sin sesión de usuario real): auth.uid() es NULL y
//      esas funciones devolverían SIEMPRE vacío si se llamaran por RPC — no
//      es un problema de RLS (que sí bypasea service_role), es un chequeo
//      manual dentro del cuerpo SQL. Por eso `kpis_direccion` REPLICA en JS
//      el cálculo de retención consultando las tablas directo (mismo criterio
//      que fn_retencion_club: atletas.estado_membresia, usuarios.estado), y
//      NO incluye ocupación de cancha en v0.1 (ver nota en la tool).
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Resuelto contra la ubicación del script, no contra process.cwd() (mismo
// motivo que blackgold-mcp: un cliente MCP lanza este proceso con el cwd
// del host, no el de este paquete).
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[blackgold-negocio-mcp] SUPABASE_SERVICE_ROLE_KEY no está en .env: con RLS v24 la anon key no puede leer ni escribir tablas y las 8 tools fallarán.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const server = new McpServer({
  name: "blackgold-negocio-mcp",
  version: "0.1.0"
});

// ============================================================================
// Constantes y helpers compartidos
// ============================================================================

// Lista cerrada de categorías de gasto. DEBE coincidir exactamente con el
// CHECK de la migración pendiente (ver supabase/migrations/*_v51_gastos_
// contabilidad_gestion.sql): si se agrega una categoría aquí sin agregarla
// también al CHECK, el INSERT fallará en la base aunque pase la validación
// de esta tool.
const CATEGORIAS_GASTO = [
  "Nómina",
  "Arriendo e instalaciones",
  "Servicios básicos",
  "Marketing y publicidad",
  "Equipamiento deportivo",
  "Mantenimiento",
  "Transporte",
  "Impuestos y permisos",
  "Insumos y suministros",
  "Otro",
];

const ESTADOS_LEAD = ["pendiente", "activo", "rechazado"];
const ESTADOS_PAGO_ABIERTOS = ["Pendiente", "Por Verificar"];
const ESTADOS_PAGO_PARCIALES = ["Abonado", "Vencido"];

function textoError(mensaje) {
  return { content: [{ type: "text", text: `Error: ${mensaje}` }] };
}

function textoOk(texto) {
  return { content: [{ type: "text", text: texto }] };
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDiasISO(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diasEntre(desdeISO, hastaISO) {
  const a = new Date(desdeISO + "T00:00:00");
  const b = new Date(hastaISO + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Mensaje legible cuando la tabla `gastos` (migración pendiente, ver PASO 3
// del encargo) todavía no existe en la base real.
function esErrorTablaInexistente(err) {
  const msg = String(err?.message || "");
  return /relation .*gastos.* does not exist/i.test(msg) || err?.code === "42P01";
}

// Agregación de un lote de `pagos` (Mensualidad + Adicional) al mismo criterio
// que duenoData.js (derivePagos): recaudado = Pagado completo + parte cobrada
// de Abonado/Vencido; por cobrar = saldo de Pendiente/Por Verificar/Abonado/
// Vencido; vencidos = conteo + monto pendiente de los en estado Vencido. Se
// reutiliza la MISMA regla de negocio que ya usa el panel del dueño, no una
// inventada para este servidor.
function agregarCobranza(pagos) {
  let recaudado = 0, porCobrar = 0, vencidoCount = 0, vencidoMonto = 0, becados = 0;
  const porGrupo = new Map();
  const porCategoria = new Map();

  const acumular = (mapa, clave, cobradoFila, saldoFila, esVencido) => {
    const prev = mapa.get(clave) || { recaudado: 0, por_cobrar: 0, vencido_count: 0, vencido_monto: 0 };
    prev.recaudado += cobradoFila;
    prev.por_cobrar += saldoFila;
    if (esVencido) { prev.vencido_count += 1; prev.vencido_monto += saldoFila; }
    mapa.set(clave, prev);
  };

  for (const p of pagos) {
    const monto = Number(p.monto_final) || 0;
    const pagado = Number(p.monto_pagado) || 0;
    let cobradoFila = 0;
    let saldoFila = 0;

    if (p.estado === "Pagado") {
      cobradoFila = monto;
    } else if (ESTADOS_PAGO_ABIERTOS.includes(p.estado)) {
      saldoFila = monto - pagado;
    } else if (ESTADOS_PAGO_PARCIALES.includes(p.estado)) {
      cobradoFila = pagado;
      saldoFila = monto - pagado;
    }
    // 'Becado' y 'Anulado' no aportan a recaudado ni a por_cobrar (mismo
    // criterio que derivePagos: un becado no genera caja, un anulado se cae).

    recaudado += cobradoFila;
    porCobrar += saldoFila;
    if (p.estado === "Vencido") { vencidoCount += 1; vencidoMonto += saldoFila; }
    if (p.estado === "Becado") becados += 1;

    const grupo = p.atletas?.grupo_nombre || "Sin grupo";
    const categoria = p.atletas?.usuarios?.categoria_feb || "Sin categoría";
    acumular(porGrupo, grupo, cobradoFila, saldoFila, p.estado === "Vencido");
    acumular(porCategoria, categoria, cobradoFila, saldoFila, p.estado === "Vencido");
  }

  const mapaAArray = (mapa) => [...mapa.entries()].map(([clave, v]) => ({
    nombre: clave,
    recaudado: round2(v.recaudado),
    por_cobrar: round2(v.por_cobrar),
    vencido_count: v.vencido_count,
    vencido_monto: round2(v.vencido_monto),
  })).sort((a, b) => b.recaudado - a.recaudado);

  return {
    total_pagos: pagos.length,
    recaudado: round2(recaudado),
    por_cobrar: round2(porCobrar),
    vencidos: { count: vencidoCount, monto: round2(vencidoMonto) },
    becados,
    por_grupo: mapaAArray(porGrupo),
    por_categoria_feb: mapaAArray(porCategoria),
  };
}

// ============================================================================
// Tool 1 — listar_leads_pipeline
// ============================================================================
// DISCREPANCIA: la spec (§6) habla de "tabla solicitudes_registro (v33)".
// Esa tabla no existe: v33 agregó usuarios.estado ('pendiente'|'activo'|
// 'rechazado') sobre la tabla `usuarios` ya existente (rol='atleta'), y la
// resolución vive en la RPC resolver_solicitud_registro. Esta tool consulta
// `usuarios` directo, generalizando fetchSolicitudesPendientes (solicitudes-
// Service.js) para aceptar cualquier estado, no solo 'pendiente' — así sirve
// para ver el pipeline completo, no solo la bandeja de pendientes.
// SEGURIDAD — revisión del 2026-07-29. Esta tool devolvía en bloque cédula,
// correo, teléfono, fecha de nacimiento y género de atletas MENORES, más el
// nombre y teléfono del representante, y con `club` opcional agregaba los cinco
// clubes por defecto. Violaba las tres reglas que este mismo archivo se impone
// en `alertas_vencidos` (ver el bloque de arriba), sobre datos todavía más
// sensibles. Se aplican aquí las mismas tres:
//   1. Los datos de contacto NO salen en bloque: hacen falta `usuario_id`
//      concreto Y `incluir_contacto: true`.
//   2. fecha_nacimiento y genero se dejan de pedir: no los usaba nadie (el
//      mapeo ya los descartaba) y eran superficie inútil.
//   3. El club es explícito: o se nombra, o se pide `todos_los_clubes: true` a
//      sabiendas, porque con service_role no hay RLS que acote.
server.tool(
  "listar_leads_pipeline",
  "Lista leads (registros de atletas) del pipeline de ingreso: pendientes de aprobación, activos ya aprobados o rechazados. Un 'lead' es una fila de usuarios con rol='atleta' — no existe una tabla de solicitudes separada. Por seguridad NO devuelve datos de contacto en bloque: para los de UN caso, pasa su `usuario_id` junto con `incluir_contacto: true`. Exige nombrar el club o pedir `todos_los_clubes: true`.",
  {
    estado: z.enum(ESTADOS_LEAD).optional().describe("Filtra por estado de la cuenta: 'pendiente' (recién registrado, sin aprobar), 'activo' (aprobado) o 'rechazado'. Si se omite, trae los tres."),
    club: z.string().optional().describe("Filtra por club (texto exacto, ej. 'Black Gold'). Obligatorio salvo que pases todos_los_clubes: true."),
    todos_los_clubes: z.boolean().optional().describe("Ponlo en true para agregar TODOS los clubes a sabiendas. Sin esto y sin `club`, la tool no devuelve nada."),
    desde: z.string().optional().describe("Fecha ISO (YYYY-MM-DD): solo leads registrados desde esta fecha."),
    hasta: z.string().optional().describe("Fecha ISO (YYYY-MM-DD): solo leads registrados hasta esta fecha."),
    usuario_id: z.string().optional().describe("UUID de UN lead concreto. Necesario, junto con incluir_contacto, para obtener sus datos de contacto."),
    incluir_contacto: z.boolean().optional().describe("Solo con `usuario_id`: añade cédula, correo y teléfono de ESE lead y el teléfono de su representante."),
  },
  async ({ estado, club, todos_los_clubes, desde, hasta, usuario_id, incluir_contacto }) => {
    try {
      if (!club && !todos_los_clubes && !usuario_id) {
        return textoError(
          "Falta acotar el club. Estos son datos personales de menores: pasa `club: '<nombre>'`, " +
          "o `todos_los_clubes: true` si de verdad necesitas agregar todos los clubes."
        );
      }
      // El contacto sale de a uno, nunca en lista.
      const contactoDeUno = !!(usuario_id && incluir_contacto);

      let q = supabase
        .from("usuarios")
        .select(`
          id, cedula, nombre, correo, telefono, club, estado, created_at,
          atletas!atletas_usuario_id_fkey ( id, posicion, estado_membresia, fecha_alta )
        `)
        .eq("rol", "atleta")
        .order("created_at", { ascending: false })
        .limit(300);

      if (estado) q = q.eq("estado", estado);
      if (club) q = q.eq("club", club);
      if (desde) q = q.gte("created_at", desde);
      if (hasta) q = q.lte("created_at", hasta + "T23:59:59");
      if (usuario_id) q = q.eq("id", usuario_id);

      const { data, error } = await q;
      if (error) return textoError("No se pudo consultar el pipeline de leads: " + error.message);

      const filas = (data || []).map((u) => {
        const fila = {
          usuario_id: u.id,
          nombre: u.nombre,
          club: u.club,
          estado: u.estado,
          registrado_en: u.created_at,
          atleta_id: u.atletas?.[0]?.id ?? null,
          posicion: u.atletas?.[0]?.posicion ?? null,
          estado_membresia: u.atletas?.[0]?.estado_membresia ?? null,
          fecha_aprobacion: u.atletas?.[0]?.fecha_alta ?? null,
        };
        if (contactoDeUno) {
          fila.cedula = u.cedula;
          fila.correo = u.correo;
          fila.telefono = u.telefono;
        }
        return fila;
      });

      // Representante vinculado (si el registro lo incluyó) — mismo patrón
      // que fetchSolicitudesPendientes. Solo el nombre, salvo contacto de uno.
      const atletaIds = filas.map((f) => f.atleta_id).filter(Boolean);
      if (atletaIds.length > 0) {
        const { data: vinculos } = await supabase
          .from("padres_atletas")
          .select("atleta_id, usuarios!padres_atletas_padre_id_fkey ( nombre, telefono, estado )")
          .in("atleta_id", atletaIds);
        const padrePorAtleta = {};
        (vinculos || []).forEach((v) => {
          if (v.usuarios && !padrePorAtleta[v.atleta_id]) padrePorAtleta[v.atleta_id] = v.usuarios;
        });
        filas.forEach((f) => {
          const p = padrePorAtleta[f.atleta_id];
          if (!p) { f.representante = null; return; }
          f.representante = contactoDeUno
            ? { nombre: p.nombre, telefono: p.telefono, estado: p.estado }
            : { nombre: p.nombre, estado: p.estado };
        });
      }

      return textoOk(JSON.stringify({
        total: filas.length,
        contacto_incluido: contactoDeUno,
        leads: filas,
      }, null, 2));
    } catch (err) {
      return textoError(err.message);
    }
  }
);

// ============================================================================
// Tool 2 — resumen_conversion_leads
// ============================================================================
// DISCREPANCIA: no hay columna de "fecha de decisión" en usuarios (no tiene
// updated_at). Se usa atletas.fecha_alta como proxy del momento de aprobación
// (la RPC resolver_solicitud_registro la fija a current_date exactamente al
// aprobar) — el tiempo de conversión es una aproximación en días completos,
// no un timestamp exacto.
server.tool(
  "resumen_conversion_leads",
  "Tasa de conversión de leads (solicitud de registro → atleta activo aprobado) y tiempo promedio hasta la aprobación, en un rango de fechas.",
  {
    desde: z.string().optional().describe("Fecha ISO (YYYY-MM-DD) de inicio del rango. Por defecto, 90 días atrás."),
    hasta: z.string().optional().describe("Fecha ISO (YYYY-MM-DD) de fin del rango. Por defecto, hoy."),
    club: z.string().optional().describe("Filtra por club. Si se omite, agrega todos los clubes."),
  },
  async ({ desde, hasta, club }) => {
    try {
      const hastaEf = hasta || hoyISO();
      const desdeEf = desde || sumarDiasISO(hastaEf, -90);
      if (diasEntre(desdeEf, hastaEf) < 0) return textoError("'desde' no puede ser posterior a 'hasta'.");

      let q = supabase
        .from("usuarios")
        .select(`
          id, estado, created_at, club,
          atletas!atletas_usuario_id_fkey ( fecha_alta )
        `)
        .eq("rol", "atleta")
        .gte("created_at", desdeEf)
        .lte("created_at", hastaEf + "T23:59:59");

      if (club) q = q.eq("club", club);

      const { data, error } = await q;
      if (error) return textoError("No se pudo calcular la conversión: " + error.message);

      const leads = data || [];
      const aprobados = leads.filter((u) => u.estado === "activo");
      const rechazados = leads.filter((u) => u.estado === "rechazado");
      const pendientes = leads.filter((u) => u.estado === "pendiente");

      const tiempos = aprobados
        .map((u) => {
          const fechaAlta = u.atletas?.[0]?.fecha_alta;
          if (!fechaAlta) return null;
          return diasEntre(u.created_at.slice(0, 10), fechaAlta);
        })
        .filter((n) => n !== null && n >= 0);

      const tiempoPromedioDias = tiempos.length > 0
        ? round2(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)
        : null;

      const resumen = {
        rango: { desde: desdeEf, hasta: hastaEf },
        club: club || "(todos)",
        total_leads: leads.length,
        aprobados: aprobados.length,
        rechazados: rechazados.length,
        pendientes: pendientes.length,
        tasa_conversion_pct: leads.length > 0 ? round2((aprobados.length / leads.length) * 100) : 0,
        tiempo_promedio_aprobacion_dias: tiempoPromedioDias,
        nota: tiempoPromedioDias === null
          ? "Sin datos suficientes de fecha_alta para calcular tiempo de aprobación en este rango."
          : "tiempo_promedio_aprobacion_dias es una aproximación: usa atletas.fecha_alta como proxy de la fecha de aprobación (usuarios no tiene columna de fecha de decisión).",
      };

      return textoOk(JSON.stringify(resumen, null, 2));
    } catch (err) {
      return textoError(err.message);
    }
  }
);

// ============================================================================
// Tool 3 — estado_cobranza
// ============================================================================
// DECISIÓN: la spec pide "rango de fechas"; pagosService.fetchPagosMes (la
// fuente de verdad de este dato en la app) opera por mes+año, no por rango
// arbitrario, porque las mensualidades SON mensuales (mes/anio son columnas
// de pagos). Se sigue ese mismo criterio en vez de inventar un rango de
// fechas que no encajaría con cómo se generan los cargos.
server.tool(
  "estado_cobranza",
  "Totales de cobranza de un mes: recaudado, por cobrar, vencidos y becados, desglosados por grupo de entrenamiento y por categoría FEB. Mismo criterio de agregación que el panel del dueño (Finanzas).",
  {
    club: z.string().optional().describe("Filtra por club. Si se omite, agrega todos los clubes."),
    mes: z.number().int().min(1).max(12).optional().describe("Mes (1-12). Por defecto, el mes actual."),
    anio: z.number().int().min(2024).max(2100).optional().describe("Año. Por defecto, el año actual."),
  },
  async ({ club, mes, anio }) => {
    try {
      const hoy = new Date();
      const mesEf = mes ?? hoy.getMonth() + 1;
      const anioEf = anio ?? hoy.getFullYear();

      let q = supabase
        .from("pagos")
        .select(`
          id, tipo, estado, monto_final, monto_pagado,
          atletas!inner (
            id, grupo_nombre,
            usuarios!inner!atletas_usuario_id_fkey ( club, categoria_feb )
          )
        `)
        .eq("mes", mesEf)
        .eq("anio", anioEf)
        .in("tipo", ["Mensualidad", "Adicional"]);

      if (club) q = q.eq("atletas.usuarios.club", club);

      const { data, error } = await q;
      if (error) return textoError("No se pudo consultar la cobranza: " + error.message);

      const resumen = agregarCobranza(data || []);
      resumen.periodo = { mes: mesEf, anio: anioEf };
      resumen.club = club || "(todos)";

      return textoOk(JSON.stringify(resumen, null, 2));
    } catch (err) {
      return textoError(err.message);
    }
  }
);

// ============================================================================
// Tool 4 — comprobantes_por_validar
//
// SEGURIDAD — revisión del 2026-07-29. Igual que sus hermanas
// listar_leads_pipeline y alertas_vencidos: esta tool corre con la
// service_role key (se salta la RLS por club de la v24), y sin acotar
// devolvía en bloque, de TODOS los clubes, el nombre del atleta, banco,
// número de documento y monto de hasta 200 comprobantes de transferencia. El
// club ahora es explícito: o se nombra, o se pide `todos_los_clubes: true` a
// sabiendas.
// ============================================================================
server.tool(
  "comprobantes_por_validar",
  "Lista los comprobantes de transferencia subidos por las familias que aún no han sido revisados por el staff (estado 'pendiente'), con los datos del pago y del atleta. Exige nombrar el club o pedir `todos_los_clubes: true`.",
  {
    club: z.string().optional().describe("Club sobre el que consultar. Obligatorio, salvo que se pase todos_los_clubes:true."),
    todos_los_clubes: z.boolean().optional().describe("true para consultar TODOS los clubes a la vez. Úsalo solo si de verdad hace falta: esta tool no tiene barrera por club."),
  },
  async ({ club, todos_los_clubes }) => {
    try {
      if (!club && !todos_los_clubes) {
        return textoError(
          "Falta acotar el club. Esta tool usa la service_role key, así que se salta la RLS por club de la v24: sin acotar devolvería los comprobantes (nombre del atleta, banco, número de documento, monto) de TODOS los clubes. Pasa `club: \"<nombre>\"`, o `todos_los_clubes: true` si de verdad los quieres todos."
        );
      }

      let q = supabase
        .from("pago_comprobantes")
        .select(`
          id, pago_id, banco, numero_documento, monto_declarado, fecha_transferencia, created_at,
          pagos!inner (
            id, tipo, concepto, mes, anio, monto_final, monto_pagado, estado,
            atletas!inner (
              id, grupo_nombre,
              usuarios!inner!atletas_usuario_id_fkey ( nombre, club )
            )
          )
        `)
        .eq("estado", "pendiente")
        .order("created_at", { ascending: true })
        .limit(200);

      if (club) q = q.eq("pagos.atletas.usuarios.club", club);

      const { data, error } = await q;
      if (error) return textoError("No se pudieron consultar los comprobantes pendientes: " + error.message);

      const filas = (data || []).map((c) => ({
        comprobante_id: c.id,
        pago_id: c.pago_id,
        atleta: c.pagos?.atletas?.usuarios?.nombre ?? null,
        club: c.pagos?.atletas?.usuarios?.club ?? null,
        grupo: c.pagos?.atletas?.grupo_nombre ?? null,
        concepto: c.pagos?.concepto || c.pagos?.tipo,
        monto_final: c.pagos?.monto_final ?? null,
        monto_declarado: c.monto_declarado,
        banco: c.banco,
        numero_documento: c.numero_documento,
        fecha_transferencia: c.fecha_transferencia,
        subido_en: c.created_at,
      }));

      return textoOk(JSON.stringify({ total: filas.length, comprobantes: filas }, null, 2));
    } catch (err) {
      return textoError(err.message);
    }
  }
);

// ============================================================================
// Tool 5 — alertas_vencidos
//
// SEGURIDAD — revisión del 2026-07-26. Tres reglas duras:
//
//   1. Los teléfonos NO salen en bloque. Un agente que hace seguimiento
//      necesita UN contacto: el del caso que está atendiendo. Para obtenerlo
//      hay que pasar un `pago_id` concreto Y `incluir_contacto: true`. Sin
//      las dos cosas, la salida no lleva ningún teléfono. Una lista de 300
//      teléfonos de familias no tiene uso legítimo para un agente, y pegada
//      en un grupo publica datos de contacto de padres de menores.
//   2. `recordatorios_pausados` se respeta. Es la bandera de "esta familia
//      pidió que no la molesten" y la app ya la honra (ColaRecordatorios.jsx
//      excluye esas filas de la cola de envío). Aquí se excluyen igual, salvo
//      que se pidan a propósito.
//   3. El club es explícito. Este proceso usa la service_role key y por tanto
//      se salta la RLS por club de la v24: aquí no hay barrera. O se nombra el
//      club, o se pide `todos_los_clubes: true` a sabiendas.
//
// Y la regla que no se puede codificar aquí: esta tool NO envía nada, y este
// servidor MCP no va a ganar nunca una tool de envío. El envío vive en el
// canal de WhatsApp de OpenClaw y, de momento, solo hacia el grupo de
// dirección. Mensajería en frío a números individuales es la vía rápida a que
// baneen el número del club.
// ============================================================================
server.tool(
  "alertas_vencidos",
  "Lista atletas/familias con pagos en estado 'Vencido', del más antiguo al más reciente. Por seguridad NO devuelve teléfonos en bloque: para el contacto de UN caso, pasa su `pago_id` junto con `incluir_contacto: true`. Excluye por defecto a las familias con recordatorios pausados. No envía mensajes.",
  {
    club: z.string().optional().describe("Club sobre el que consultar. Obligatorio, salvo que se pase todos_los_clubes:true."),
    todos_los_clubes: z.boolean().optional().describe("true para consultar TODOS los clubes a la vez. Úsalo solo si de verdad hace falta: esta tool no tiene barrera por club."),
    umbral_dias: z.number().int().min(0).optional().describe("Solo pagos vencidos hace AL MENOS este número de días. Por defecto 0 (cualquier vencido)."),
    pago_id: z.string().optional().describe("Restringe la consulta a un solo pago. Es requisito para poder pedir el contacto."),
    incluir_contacto: z.boolean().optional().describe("Devuelve el teléfono del representante de pagos. Solo funciona junto con pago_id, y solo de ese caso."),
    incluir_pausados: z.boolean().optional().describe("Incluye familias con recordatorios pausados. Por defecto false: esas familias pidieron no recibir recordatorios."),
  },
  async ({ club, todos_los_clubes, umbral_dias, pago_id, incluir_contacto, incluir_pausados }) => {
    try {
      if (!club && !todos_los_clubes) {
        return textoError(
          "Falta acotar el club. Esta tool usa la service_role key, así que se salta la RLS por club de la v24: sin acotar devolvería los morosos de TODOS los clubes. Pasa `club: \"<nombre>\"`, o `todos_los_clubes: true` si de verdad los quieres todos."
        );
      }
      if (incluir_contacto && !pago_id) {
        return textoError(
          "No devuelvo teléfonos en bloque. Para el contacto de una familia, pasa el `pago_id` de ese caso concreto junto con `incluir_contacto: true`. Los datos de contacto de las familias no se listan de golpe ni se publican en un grupo."
        );
      }

      const umbral = umbral_dias ?? 0;
      const hoy = hoyISO();
      const fechaCorte = sumarDiasISO(hoy, -umbral);

      let q = supabase
        .from("pagos")
        .select(`
          id, tipo, concepto, mes, anio, monto_final, monto_pagado, fecha_vencimiento, atleta_id,
          atletas!inner (
            id, grupo_nombre, recordatorios_pausados,
            usuarios!inner!atletas_usuario_id_fkey ( nombre, club )
          )
        `)
        .eq("estado", "Vencido")
        .lte("fecha_vencimiento", fechaCorte)
        .order("fecha_vencimiento", { ascending: true })
        .limit(300);

      if (club) q = q.eq("atletas.usuarios.club", club);
      if (pago_id) q = q.eq("id", pago_id);

      const { data, error } = await q;
      if (error) return textoError("No se pudo consultar vencidos: " + error.message);

      const todas = data || [];

      // Regla 2 — fuera las familias que pidieron no recibir recordatorios.
      const pausadas = todas.filter((p) => p.atletas?.recordatorios_pausados === true);
      const filas = incluir_pausados ? todas : todas.filter((p) => p.atletas?.recordatorios_pausados !== true);

      // Regla 1 — el contacto solo se resuelve para UN pago, y solo si se pidió.
      let contactoUnico = null;
      if (incluir_contacto && pago_id && filas.length === 1) {
        const { data: vinculos } = await supabase
          .from("padres_atletas")
          .select("atleta_id, es_rep_pagos, usuarios!padres_atletas_padre_id_fkey ( nombre, telefono )")
          .eq("atleta_id", filas[0].atleta_id);
        // Mismo criterio que fetchContactosPago (pagosService.js): manda el
        // representante de pagos; si no hay, el primer vínculo.
        (vinculos || []).forEach((v) => {
          if (!contactoUnico || (v.es_rep_pagos && !contactoUnico.es_rep_pagos)) {
            contactoUnico = {
              nombre: v.usuarios?.nombre ?? null,
              telefono: v.usuarios?.telefono ?? null,
              es_rep_pagos: v.es_rep_pagos,
            };
          }
        });
      }

      const resultado = filas.map((p) => ({
        pago_id: p.id,
        atleta: p.atletas?.usuarios?.nombre ?? null,
        club: p.atletas?.usuarios?.club ?? null,
        grupo: p.atletas?.grupo_nombre ?? null,
        concepto: p.concepto || `${p.tipo} ${p.mes ?? ""}/${p.anio ?? ""}`.trim(),
        saldo: round2((Number(p.monto_final) || 0) - (Number(p.monto_pagado) || 0)),
        fecha_vencimiento: p.fecha_vencimiento,
        dias_vencido: diasEntre(p.fecha_vencimiento, hoy),
        recordatorios_pausados: p.atletas?.recordatorios_pausados ?? false,
        // El contacto solo aparece en la consulta de un caso único.
        contacto: contactoUnico && p.id === pago_id ? contactoUnico : undefined,
      }));

      const avisos = [];
      if (!incluir_contacto) {
        avisos.push(
          "Sin teléfonos: se omiten a propósito. Para el contacto de un caso, vuelve a llamar con su pago_id e incluir_contacto:true."
        );
      }
      if (incluir_contacto && pago_id && filas.length !== 1) {
        avisos.push(
          "Se pidió el contacto pero la consulta no devolvió exactamente un pago, así que no se resolvió ningún teléfono."
        );
      }
      if (!incluir_pausados && pausadas.length > 0) {
        avisos.push(
          `${pausadas.length} pago(s) vencido(s) quedaron fuera porque esas familias tienen los recordatorios pausados. No se les debe escribir. Para verlos igualmente: incluir_pausados:true.`
        );
      }
      if (todos_los_clubes && !club) {
        avisos.push("Consulta sobre TODOS los clubes. No compartas esta salida fuera de dirección.");
      }
      avisos.push("Esta herramienta no envía mensajes. El envío lo decide un humano.");

      return textoOk(
        JSON.stringify(
          {
            umbral_dias: umbral,
            club: club ?? "(todos)",
            total: resultado.length,
            avisos,
            vencidos: resultado,
          },
          null,
          2
        )
      );
    } catch (err) {
      return textoError(err.message);
    }
  }
);

// ============================================================================
// Tool 6 — kpis_direccion
// ============================================================================
server.tool(
  "kpis_direccion",
  "KPIs de dirección: ingresos del mes (recaudado/por cobrar/vencidos), atletas activos, retención y solicitudes pendientes. Replica en JS el criterio de fn_retencion_club (v31) porque esa RPC está gateada por sesión de staff y devuelve vacío con la service_role key de este servidor. NO incluye ocupación de cancha en v0.1 (ver nota en el resultado).",
  {
    club: z.string().optional().describe("Filtra por club. Si se omite, agrega todos los clubes."),
    mes: z.number().int().min(1).max(12).optional().describe("Mes (1-12) para los ingresos. Por defecto, el mes actual."),
    anio: z.number().int().min(2024).max(2100).optional().describe("Año para los ingresos. Por defecto, el año actual."),
  },
  async ({ club, mes, anio }) => {
    try {
      const hoy = new Date();
      const mesEf = mes ?? hoy.getMonth() + 1;
      const anioEf = anio ?? hoy.getFullYear();

      // --- Ingresos del mes (misma agregación que estado_cobranza) ---
      let qPagos = supabase
        .from("pagos")
        .select(`
          id, tipo, estado, monto_final, monto_pagado,
          atletas!inner ( id, grupo_nombre, usuarios!inner!atletas_usuario_id_fkey ( club, categoria_feb ) )
        `)
        .eq("mes", mesEf).eq("anio", anioEf).in("tipo", ["Mensualidad", "Adicional"]);
      if (club) qPagos = qPagos.eq("atletas.usuarios.club", club);
      const { data: pagosData, error: errPagos } = await qPagos;
      if (errPagos) return textoError("No se pudieron calcular los ingresos: " + errPagos.message);
      const ingresos = agregarCobranza(pagosData || []);

      // --- Retención + atletas activos (réplica de fn_retencion_club, v31) ---
      let qAtletas = supabase
        .from("atletas")
        .select(`
          id, estado_membresia, fecha_alta, fecha_baja,
          usuarios!inner!atletas_usuario_id_fkey ( club, estado )
        `)
        .eq("usuarios.estado", "activo"); // cuentas pendientes/rechazadas no son membresía (v33)
      if (club) qAtletas = qAtletas.eq("usuarios.club", club);
      const { data: atletasData, error: errAtletas } = await qAtletas;
      if (errAtletas) return textoError("No se pudo calcular la retención: " + errAtletas.message);

      const total = (atletasData || []).length;
      const activos = (atletasData || []).filter((a) => (a.estado_membresia ?? "activo") === "activo").length;
      const retPct = total > 0 ? Math.round((100 * activos) / total) : 0;

      // Altas/bajas de los últimos 5 meses (mismo default que fn_retencion_club).
      const MESES_VENTANA = 5;
      const altasBajas = [];
      for (let i = MESES_VENTANA - 1; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const altas = (atletasData || []).filter((a) => (a.fecha_alta || "").slice(0, 7) === ym).length;
        const bajas = (atletasData || []).filter((a) => (a.fecha_baja || "").slice(0, 7) === ym).length;
        altasBajas.push({ mes: ym, altas, bajas });
      }

      // --- Solicitudes pendientes (contarSolicitudesPendientes, solicitudesService.js) ---
      let qPend = supabase.from("usuarios").select("id", { count: "exact", head: true })
        .eq("rol", "atleta").eq("estado", "pendiente");
      if (club) qPend = qPend.eq("club", club);
      const { count: solicitudesPendientes, error: errPend } = await qPend;
      if (errPend) return textoError("No se pudieron contar las solicitudes pendientes: " + errPend.message);

      const resultado = {
        club: club || "(todos)",
        periodo_ingresos: { mes: mesEf, anio: anioEf },
        ingresos,
        atletas: { total_membresia: total, activos, ret_pct: retPct, altas_bajas_ultimos_5_meses: altasBajas },
        solicitudes_pendientes: solicitudesPendientes ?? 0,
        ocupacion_cancha: null,
        nota_ocupacion: "No incluida en v0.1: fn_ocupacion_cancha (v32) está gateada por sesión de staff (current_user_club() vía auth.uid()) y devuelve vacío con la service_role key de este MCP. Requiere réplica propia de la rejilla día×franja — pendiente para una v0.2.",
      };

      return textoOk(JSON.stringify(resultado, null, 2));
    } catch (err) {
      return textoError(err.message);
    }
  }
);

// ============================================================================
// Tool 7 — registrar_gasto (ÚNICA tool que escribe)
// ============================================================================
// La tabla `gastos` NO EXISTE HOY en la base real (la app no registra gastos —
// ver §6 de la spec y el diagnóstico de negocio). Esta tool queda escrita y
// lista, pero FALLARÁ hasta que Jorge aplique la migración
// supabase/migrations/<timestamp>_v51_gastos_contabilidad_gestion.sql con
// `npx supabase db push` (ver PASO 3 del encargo y el README).
server.tool(
  "registrar_gasto",
  "Registra un gasto de gestión (nómina, arriendo, marketing, etc.) — ÚNICA tool de este servidor que escribe datos. Requiere la migración de la tabla `gastos` aplicada (ver README); si no está aplicada, esta tool falla con un error claro.",
  {
    monto: z.number().positive().describe("Monto del gasto en dólares. Debe ser un número positivo."),
    categoria: z.enum(CATEGORIAS_GASTO).describe(`Categoría del gasto. Valores válidos: ${CATEGORIAS_GASTO.join(", ")}.`),
    descripcion: z.string().min(1, "La descripción no puede estar vacía.").describe("Descripción breve del gasto (obligatoria)."),
    fecha: z.string().optional().describe("Fecha ISO (YYYY-MM-DD) del gasto. Por defecto, hoy."),
    club: z.string().optional().describe("Club al que pertenece el gasto. Por defecto, 'Black Gold'."),
    registrado_por: z.string().min(1).describe("Quién registra el gasto (nombre de la persona o del agente, ej. 'Pythagoras' o 'Jorge'). Campo de texto libre: este MCP corre con service_role, sin una sesión de usuario ligada a usuarios.id."),
  },
  async ({ monto, categoria, descripcion, fecha, club, registrado_por }) => {
    try {
      if (!Number.isFinite(monto) || monto <= 0) {
        return textoError("El monto debe ser un número positivo.");
      }
      if (!CATEGORIAS_GASTO.includes(categoria)) {
        return textoError(`Categoría inválida. Debe ser una de: ${CATEGORIAS_GASTO.join(", ")}.`);
      }
      if (!descripcion || !descripcion.trim()) {
        return textoError("La descripción es obligatoria.");
      }

      const registro = {
        fecha: fecha || hoyISO(),
        monto: round2(monto),
        categoria,
        descripcion: descripcion.trim(),
        club: club || "Black Gold",
        registrado_por: registrado_por.trim(),
      };

      const { data, error } = await supabase.from("gastos").insert(registro).select().single();

      if (error) {
        if (esErrorTablaInexistente(error)) {
          return textoError(
            "La tabla 'gastos' todavía no existe en la base de datos. Se escribió la migración " +
            "supabase/migrations/<timestamp>_v51_gastos_contabilidad_gestion.sql pero NO está aplicada. " +
            "Jorge debe correr `npx supabase db push` antes de poder registrar gastos con esta tool."
          );
        }
        return textoError("No se pudo registrar el gasto: " + error.message);
      }

      return textoOk("Gasto registrado:\n" + JSON.stringify(data, null, 2));
    } catch (err) {
      return textoError(err.message);
    }
  }
);

// ============================================================================
// Tool 8 — resumen_gastos
// ============================================================================
server.tool(
  "resumen_gastos",
  "Totales de gastos por categoría en un rango de fechas, comparados con la cobranza (dinero recibido) del mismo periodo. Requiere la migración de la tabla `gastos` aplicada (ver README); si no está aplicada, esta tool falla con un error claro.",
  {
    desde: z.string().optional().describe("Fecha ISO (YYYY-MM-DD) de inicio. Por defecto, el primer día del mes actual."),
    hasta: z.string().optional().describe("Fecha ISO (YYYY-MM-DD) de fin. Por defecto, hoy."),
    categoria: z.enum(CATEGORIAS_GASTO).optional().describe("Filtra por una categoría concreta. Si se omite, trae todas."),
    club: z.string().optional().describe("Filtra por club. Si se omite, agrega todos los clubes."),
  },
  async ({ desde, hasta, categoria, club }) => {
    try {
      const hoy = new Date();
      const hastaEf = hasta || hoyISO();
      const desdeEf = desde || `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
      if (diasEntre(desdeEf, hastaEf) < 0) return textoError("'desde' no puede ser posterior a 'hasta'.");

      let q = supabase.from("gastos").select("*").gte("fecha", desdeEf).lte("fecha", hastaEf);
      if (categoria) q = q.eq("categoria", categoria);
      if (club) q = q.eq("club", club);

      const { data, error } = await q;
      if (error) {
        if (esErrorTablaInexistente(error)) {
          return textoError(
            "La tabla 'gastos' todavía no existe en la base de datos. Se escribió la migración " +
            "supabase/migrations/<timestamp>_v51_gastos_contabilidad_gestion.sql pero NO está aplicada. " +
            "Jorge debe correr `npx supabase db push` antes de poder consultar gastos con esta tool."
          );
        }
        return textoError("No se pudieron consultar los gastos: " + error.message);
      }

      const gastos = data || [];
      const porCategoria = new Map();
      let total = 0;
      for (const g of gastos) {
        const monto = Number(g.monto) || 0;
        total += monto;
        porCategoria.set(g.categoria, (porCategoria.get(g.categoria) || 0) + monto);
      }

      // Cobranza real recibida en el mismo rango (dinero que SÍ entró, no el
      // devengado del mes) — pago_transacciones, mismo dataset que usa
      // fetchArqueoEfectivo/fetchTransaccionesRango (pagosService.js), sin
      // restringir a una sola forma de pago.
      let qTx = supabase
        .from("pago_transacciones")
        .select("monto, pagos!inner ( atletas!inner ( usuarios!inner!atletas_usuario_id_fkey ( club ) ) )")
        .gte("created_at", desdeEf)
        .lte("created_at", hastaEf + "T23:59:59");
      if (club) qTx = qTx.eq("pagos.atletas.usuarios.club", club);
      const { data: txData, error: errTx } = await qTx;
      if (errTx) return textoError("No se pudo comparar con la cobranza del periodo: " + errTx.message);
      const cobranzaPeriodo = round2((txData || []).reduce((s, t) => s + (Number(t.monto) || 0), 0));

      const resumen = {
        rango: { desde: desdeEf, hasta: hastaEf },
        club: club || "(todos)",
        categoria_filtrada: categoria || "(todas)",
        total_gastado: round2(total),
        por_categoria: [...porCategoria.entries()].map(([nombre, monto]) => ({ nombre, monto: round2(monto) })).sort((a, b) => b.monto - a.monto),
        cobranza_recibida_periodo: cobranzaPeriodo,
        balance_periodo: round2(cobranzaPeriodo - total),
      };

      return textoOk(JSON.stringify(resumen, null, 2));
    } catch (err) {
      return textoError(err.message);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Black Gold Negocio MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
