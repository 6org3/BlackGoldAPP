// src/lib/plantillasWhatsApp.js
//
// Fuente ÚNICA de plantillas de WhatsApp del club, consumida desde pagos,
// eventos y comunicaciones (diseño: docs/pagos_diseno.md §6). Los cuerpos se
// redactan en tono transaccional a propósito: son compatibles con la categoría
// "utility" de Meta si algún día migran a Cloud API (W3) — un texto promocional
// se recategoriza como "marketing" (6-7× más caro).
//
// `proposito` calza con la columna comunicaciones.proposito (v18):
// 'comunicado' | 'convocatoria' | 'recordatorio' | 'resultado'.

export const PLANTILLAS = {
  recordatorio_pago: {
    proposito: 'recordatorio',
    variables: ['nombre_atleta', 'concepto', 'monto', 'fecha_limite'],
    cuerpo:
`🏀 *Black Gold — Recordatorio de pago*

Hola 👋 Te recordamos que la *{concepto}* de {nombre_atleta}
por *\${monto}* vence el *{fecha_limite}*.

Puedes pagar por transferencia (sube tu comprobante en la app)
o en efectivo con el coach. ¡Gracias, familia Black Gold! 🖤💛`,
  },

  pago_vencido: {
    proposito: 'recordatorio',
    variables: ['nombre_atleta', 'concepto', 'monto', 'dias_vencido'],
    cuerpo:
`🏀 *Black Gold — Pago pendiente*

Hola, la *{concepto}* de {nombre_atleta} por *\${monto}*
está vencida hace {dias_vencido} día(s).

Si ya pagaste, sube el comprobante en la app y lo verificamos enseguida.
Cualquier inconveniente, escríbenos por aquí 🙏`,
  },

  confirmacion_pago: {
    proposito: 'comunicado',
    variables: ['nombre_atleta', 'concepto', 'monto', 'fecha_pago', 'forma_pago'],
    cuerpo:
`✅ *Black Gold — Pago recibido*

Confirmamos el pago de la *{concepto}* de {nombre_atleta}:
💵 Monto: *\${monto}*
📅 Fecha: {fecha_pago} · Forma: {forma_pago}

¡Gracias por estar al día! Nos vemos en la cancha 🏀🖤💛`,
  },

  abono_registrado: {
    proposito: 'comunicado',
    variables: ['nombre_atleta', 'concepto', 'monto_abonado', 'saldo'],
    cuerpo:
`🧾 *Black Gold — Abono registrado*

Registramos un abono de *\${monto_abonado}* a la *{concepto}*
de {nombre_atleta}. Saldo pendiente: *\${saldo}*.

Puedes ver el detalle en tu portal. ¡Gracias! 🖤💛`,
  },

  comprobante_recibido: {
    proposito: 'comunicado',
    variables: ['nombre_atleta', 'concepto'],
    cuerpo:
`📄 *Black Gold — Comprobante recibido*

Recibimos el comprobante de la *{concepto}* de {nombre_atleta}.
Está *en verificación* ⏳ — te confirmamos apenas lo revisemos.`,
  },

  comprobante_rechazado: {
    proposito: 'comunicado',
    variables: ['nombre_atleta', 'concepto', 'motivo'],
    cuerpo:
`⚠️ *Black Gold — Comprobante observado*

Revisamos el comprobante de la *{concepto}* de {nombre_atleta}
y no pudimos aprobarlo: _{motivo}_.

Por favor súbelo de nuevo desde la app, o escríbenos por aquí. 🙏`,
  },

  cargo_extra: {
    proposito: 'comunicado',
    variables: ['nombre_atleta', 'concepto', 'monto', 'fecha_limite'],
    cuerpo:
`🏀 *Black Gold — Nuevo servicio*

Registramos para {nombre_atleta}: *{concepto}*
💵 Valor: *\${monto}* · 📅 Pagar hasta: {fecha_limite}

Puedes verlo y pagarlo desde tu portal en la app. 🖤💛`,
  },

  link_pago: {
    proposito: 'comunicado',
    variables: ['nombre_atleta', 'concepto', 'monto', 'link'],
    cuerpo:
`💳 *Black Gold — Paga en línea*

{nombre_atleta} · *{concepto}* · *\${monto}*
Paga seguro con tarjeta aquí 👇
{link}

Al completar el pago se registra automáticamente. ✅`,
  },

  // Aviso corto del padre hacia el número del club tras subir un comprobante.
  aviso_comprobante_subido: {
    proposito: 'comunicado',
    variables: ['nombre_atleta', 'concepto'],
    cuerpo:
`Hola 👋 Acabo de subir el comprobante de la *{concepto}*
de {nombre_atleta} en la app, para su verificación. ¡Gracias!`,
  },

  // Migrada de generarMensajeSesion (comunicacionesService.js). `bloque_ejercicios`
  // y `bloque_notas` llevan su propio salto de línea inicial (se arman así en el
  // call-site) para que, si vienen vacíos, no dejen una línea en blanco fea —
  // en vez del salto de línea fijo que antes precedía a {bloque_notas}.
  resumen_sesion: {
    proposito: 'comunicado',
    variables: ['grupo', 'objetivo', 'emoji', 'logrado', 'bloque_ejercicios', 'bloque_notas'],
    cuerpo: `*Black Gold Basketball — Resumen de Sesión*

📋 Grupo: {grupo}
🎯 Objetivo: {objetivo}
{emoji} Resultado: {logrado}{bloque_ejercicios}{bloque_notas}`,
  },
};

/**
 * Interpola {variable} en el cuerpo de la plantilla. Lanza si falta una
 * variable declarada (adiós "$undefined" en mensajes reales).
 */
export function renderPlantilla(clave, vars = {}) {
  const plantilla = PLANTILLAS[clave];
  if (!plantilla) throw new Error(`Plantilla desconocida: ${clave}`);
  const faltantes = (plantilla.variables || []).filter(v => vars[v] === undefined || vars[v] === null);
  if (faltantes.length > 0) {
    throw new Error(`Plantilla ${clave}: faltan variables ${faltantes.join(', ')}`);
  }
  return plantilla.cuerpo.replace(/\{(\w+)\}/g, (_, nombre) =>
    vars[nombre] !== undefined && vars[nombre] !== null ? String(vars[nombre]) : `{${nombre}}`
  );
}

/**
 * Normaliza un teléfono ecuatoriano a E.164 sin '+' para wa.me.
 * '099 912-3456' → '593999123456'; '5939...' pasa igual; null si no es
 * normalizable. NUNCA escribir el valor normalizado de vuelta a la base:
 * usuarios.telefono es credencial de login y base de la cédula sintética
 * PADRE_<telefono> — se normaliza solo al armar el link.
 */
export function normalizarTelefonoEC(tel) {
  if (!tel) return null;
  const limpio = String(tel).replace(/[\s\-().+]/g, '');
  if (/^09\d{8}$/.test(limpio)) return `593${limpio.slice(1)}`;
  if (/^5939\d{8}$/.test(limpio)) return limpio;
  return null;
}

/**
 * Construye el deep link de WhatsApp. Con teléfono null cae al selector de
 * contactos (comportamiento previo de la app), nunca lanza.
 */
export function linkWhatsApp(telefono, texto) {
  const base = telefono ? `https://wa.me/${telefono}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(texto)}`;
}
