// Verifica que el club de demostración esté LLENO: que cada pantalla que se le
// va a mostrar a un tercero tenga datos, no ceros. Solo lee.
//
//   node scripts/tmp_verificar_club_demo.mjs
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLUB = process.env.CLUB_DEMO || 'Titanes de Sucumbíos';
let fallos = 0;
const ok = (etiqueta, condicion, detalle) => {
  console.log(`${condicion ? '✅' : '❌'} ${etiqueta}${detalle !== undefined ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos++;
};

const { data: personas } = await db.from('usuarios')
  .select('id, cedula, nombre, rol, correo, telefono, categoria, estado, auth_user_id')
  .eq('club', CLUB);
const idsUsuario = personas.map((p) => p.id);
const { data: atletas } = await db.from('atletas')
  .select('id, usuario_id, overall_score, rango, xp_total, grupo_nombre, nivel_desarrollo, altura_cm')
  .in('usuario_id', idsUsuario);
const ids = atletas.map((a) => a.id);

console.log(`=== ${CLUB} ===\n`);
ok('plantel completo', atletas.length === 24, `${atletas.length} atletas`);
ok('staff completo', personas.filter((p) => ['owner', 'coach'].includes(p.rol)).length === 3,
  personas.filter((p) => ['owner', 'coach'].includes(p.rol)).map((p) => `${p.rol}:${p.nombre}`).join(', '));
ok('representantes vinculados',
  (await db.from('padres_atletas').select('atleta_id', { count: 'exact', head: true }).in('atleta_id', ids)).count >= 11,
  `${(await db.from('padres_atletas').select('atleta_id', { count: 'exact', head: true }).in('atleta_id', ids)).count} vínculos`);

const { data: grupos } = await db.from('grupos_entrenamiento').select('id, nombre, precio_mensual, dias_semana').eq('club', CLUB);
ok('3 grupos con precio y días', grupos.length === 3 && grupos.every((g) => g.precio_mensual > 0 && g.dias_semana?.length),
  grupos.map((g) => `${g.nombre} $${g.precio_mensual}`).join(' · '));

// ── Radar y overall: si esto sale plano o en cero, la demostración no vale ──
const conOverall = atletas.filter((a) => a.overall_score > 0);
ok('todos con overall calculado', conOverall.length === atletas.length, `${conOverall.length}/${atletas.length}`);
const rangoOverall = [Math.min(...conOverall.map((a) => a.overall_score)), Math.max(...conOverall.map((a) => a.overall_score))];
ok('el overall varía entre atletas', rangoOverall[1] - rangoOverall[0] >= 8, `de ${rangoOverall[0]} a ${rangoOverall[1]}`);
ok('hay más de un rango representado', new Set(conOverall.map((a) => a.rango)).size >= 2,
  [...new Set(conOverall.map((a) => a.rango))].join(', '));

const { data: pruebas } = await db.from('evaluaciones_pruebas')
  .select('atleta_id, sub_pilar, tier, created_at, puntuacion_normalizada').in('atleta_id', ids);
ok('los 8 sub-pilares del radar tienen datos', new Set(pruebas.map((p) => p.sub_pilar)).size === 8,
  `${new Set(pruebas.map((p) => p.sub_pilar)).size} sub-pilares`);
const fechas = [...new Set(pruebas.map((p) => p.created_at.slice(0, 10)))].sort();
ok('3 baterías en fechas distintas', fechas.length === 3, fechas.join(' · '));
// La progresión es lo que hace que la pantalla de tendencias tenga sentido.
const mediaEn = (f) => {
  const s = pruebas.filter((p) => p.created_at.startsWith(f));
  return Math.round(s.reduce((t, p) => t + p.puntuacion_normalizada, 0) / s.length);
};
const medias = fechas.map(mediaEn);
ok('las marcas mejoran de una batería a la siguiente',
  medias[0] < medias[1] && medias[1] < medias[2], medias.join(' → '));

// ── Lo que llena cada portal ──
const cuenta = async (tabla, columna = 'atleta_id') =>
  (await db.from(tabla).select(columna, { count: 'exact', head: true }).in(columna, ids)).count;

// El radar de 8 ejes con la misma puntuación en todos es un círculo perfecto:
// se ve inventado. Se comprueba sobre la última batería del atleta logueable.
const ultima = fechas[fechas.length - 1];
const cuentaLogueable = personas.find((p) => p.cedula === '2199000101');
const atletaLogueable = atletas.find((a) => a.usuario_id === cuentaLogueable?.id);
const ejes = pruebas.filter((p) => p.atleta_id === atletaLogueable?.id && p.created_at.startsWith(ultima));
ok('el radar tiene relieve (no todos los ejes iguales)',
  new Set(ejes.map((e) => e.puntuacion_normalizada)).size >= 3,
  `${new Set(ejes.map((e) => e.puntuacion_normalizada)).size} puntuaciones distintas en ${ejes.length} pruebas`);

ok('asistencia registrada', (await cuenta('asistencia')) > 250, `${await cuenta('asistencia')} registros`);
ok('encuestas de bienestar', (await cuenta('atleta_readiness')) > 40, `${await cuenta('atleta_readiness')} respuestas`);

// "Atletas a mirar hoy" exige respuesta de HOY: con una de ayer la pantalla
// dice "sin señales" y no hay nada que mostrar (senalesAtleta.js + metricas.js).
const hoyISO = new Date().toISOString().split('T')[0];
const { data: rdHoy } = await db.from('atleta_readiness')
  .select('atleta_id, readiness_score, color_orina').in('atleta_id', ids).eq('fecha', hoyISO);
ok('hay respuestas de bienestar de hoy', (rdHoy?.length ?? 0) > 3, `${rdHoy?.length ?? 0} respuestas hoy`);
const enAlerta = (rdHoy ?? []).filter((r) => Number(r.readiness_score) < 7 || r.color_orina >= 5);
ok('alguien levanta bandera hoy', enAlerta.length > 0,
  `${enAlerta.length} con señal (scores: ${enAlerta.map((r) => Number(r.readiness_score).toFixed(1)).join(', ') || '—'})`);

// Agenda del día: si hoy ningún grupo entrena según su horario, el hueco es
// legítimo y no cuenta como fallo.
const NOMBRE_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const hoyNombre = NOMBRE_DIA[new Date().getDay()];
const gruposHoy = grupos.filter((g) => (g.dias_semana ?? []).includes(hoyNombre));
const { data: staffClub } = await db.from('usuarios').select('id').eq('club', CLUB).in('rol', ['coach', 'owner']);
const { data: sesiones } = await db.from('sesiones_control').select('id, fecha, objetivo_tipo').in('coach_id', staffClub.map((s) => s.id));
ok('agenda de sesiones sembrada', (sesiones?.length ?? 0) > 20, `${sesiones?.length ?? 0} sesiones en 4 semanas`);
const sesionesHoy = (sesiones ?? []).filter((s) => s.fecha === hoyISO);
ok(`sesión programada para hoy (${hoyNombre.toLowerCase()})`,
  gruposHoy.length === 0 || sesionesHoy.length > 0,
  gruposHoy.length === 0
    ? 'hoy no entrena ningún grupo según su horario, el hueco es real'
    : `${sesionesHoy.length} de ${gruposHoy.length} grupo(s) que entrenan hoy`);

const { data: progresos } = await db.from('progreso_misiones').select('atleta_id, estado').in('atleta_id', ids);
const conMision = new Set(progresos.map((p) => p.atleta_id));
ok('casi todo el plantel tiene misiones', conMision.size >= atletas.length - 2, `${conMision.size}/${atletas.length} atletas`);
ok('hay misiones aprobadas y pendientes',
  progresos.some((p) => p.estado === 'aprobada') && progresos.some((p) => p.estado !== 'aprobada'),
  [...new Set(progresos.map((p) => p.estado))].join(', '));

const conXp = atletas.filter((a) => (a.xp_total ?? 0) > 0);
ok('la mayoría del plantel tiene XP', conXp.length >= atletas.length * 0.6, `${conXp.length}/${atletas.length} con XP`);

const { data: pagos } = await db.from('pagos').select('estado, monto_final, mes').in('atleta_id', ids);
const porEstado = {};
for (const p of pagos) porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1;
ok('pagos en varios estados', Object.keys(porEstado).length >= 3, JSON.stringify(porEstado));
const { data: dtos } = await db.from('pagos').select('descuento_pct').in('atleta_id', ids).gt('descuento_pct', 0);
ok('el descuento por hermanos se aplica', (dtos?.length ?? 0) > 0, `${dtos?.length ?? 0} mensualidades con descuento`);

const { data: cfg } = await db.from('club_config').select('*').eq('club', CLUB).maybeSingle();
ok('configuración de cobros', !!cfg?.cuenta_bancaria_texto && cfg?.descuento_hermanos_pct > 0,
  cfg ? `día ${cfg.dia_vencimiento}, hermanos ${cfg.descuento_hermanos_pct}%` : 'sin config');

const { data: eventos } = await db.from('eventos').select('id, titulo, estado').eq('club', CLUB);
ok('evento publicado', eventos.some((e) => e.estado === 'publicado'), eventos.map((e) => e.titulo).join(', '));
const { count: nConv } = await db.from('evento_convocados')
  .select('id', { count: 'exact', head: true }).in('evento_id', eventos.map((e) => e.id));
ok('convocatoria con respuestas', nConv > 5, `${nConv} convocados`);

const owner = personas.find((p) => p.rol === 'owner');
const { count: nCom } = await db.from('comunicaciones').select('id', { count: 'exact', head: true }).eq('autor_id', owner.id);
ok('comunicado del club', nCom > 0, `${nCom} comunicados`);

// ── Que ninguna cuenta arrastre la marca de cambio obligatorio ──
console.log('\n── Cuentas de acceso ──');
for (const p of personas.filter((x) => x.auth_user_id)) {
  const { data } = await db.auth.admin.getUserById(p.auth_user_id);
  const marca = data?.user?.app_metadata?.debe_cambiar_password === true;
  ok(`${p.rol.padEnd(6)} ${p.nombre}`, !marca && p.estado === 'activo',
    marca ? 'arrastra cambio obligatorio de contraseña' : `estado=${p.estado}`);
}

console.log(`\n${fallos === 0 ? '✅ El club está listo para mostrarse.' : `❌ ${fallos} punto(s) flojo(s).`}`);
process.exit(fallos ? 1 : 0);
