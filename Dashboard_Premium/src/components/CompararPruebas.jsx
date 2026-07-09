import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import { GitCompareArrows } from 'lucide-react';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { fetchCatalogoPruebas, fetchEvaluacionesDeAtletas } from '../api/evaluacionesService';
// Agregación pura compartida (fuente única en analytics-core): último valor
// por atleta (con manejo bilateral) y media de un conjunto en una prueba.
import { seriePorPrueba, compararPruebaGrupo } from '../../../packages/analytics-core/tendencias.js';
import { CATEGORIAS_FEB } from '../../../packages/analytics-core/categoriaFEB.js';
import { COLORS, CHART, VARIANTS } from '../lib/designTokens';

// Reproduce la vista "Comparar" del mockup v6 (docs/mockup_v6_comparar_graficos.html):
// selector de categoría + prueba, dot-plot de distribución de la categoría,
// bullet del atleta vs medias y su histórico con las medias como referencia.

const fechaCorta = (iso) =>
  new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso)
    .toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || '—';

// Trazos neutros compartidos por los tres gráficos (mismos valores del mockup;
// no son colores nuevos: blanco/negro base con alpha, sin hex fuera de tokens).
const LINEA_CLUB = CHART.series[1];          // blanco tenue: media del club
const LINEA_FILA = 'rgba(255,255,255,0.06)'; // guía horizontal de cada fila
const FILA_SELECCIONADA = 'rgba(255,215,0,0.06)';

// ────────────────────────────────────────────────────────────────
// Gráfico 1 — dot-plot de distribución (SVG propio, geometría distChart)
// ────────────────────────────────────────────────────────────────
function DistribucionChart({ filas, mediaCategoria, mediaClub, unidad, invertido, seleccionadoId, onSelect }) {
  const W = 330, rowH = 30, top = 24, x0 = 58, x1 = 306;
  const H = top + filas.length * rowH + 6;

  const todos = [...filas.map(f => f.valor), mediaCategoria, mediaClub].filter(v => v != null);
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);
  const pad = (hi - lo) * 0.18 || 1;
  lo -= pad; hi += pad;
  const xp = v => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  // "Lado bueno" de la media de categoría según la dirección de la prueba.
  const esBueno = v => (invertido ? v <= mediaCategoria : v >= mediaCategoria);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label="Distribución de la prueba en la categoría; cada fila es un atleta">
      <title>Distribución de la categoría: un punto por atleta, con medias de categoría y club</title>
      {mediaClub != null && (
        <g aria-hidden="true">
          <line x1={xp(mediaClub)} y1="16" x2={xp(mediaClub)} y2={H - 4} stroke={LINEA_CLUB} strokeWidth="1.3" strokeDasharray="3 3" />
          <text x={xp(mediaClub)} y="11" fill={CHART.label} fontSize="8" textAnchor="middle" fontWeight="700">club</text>
        </g>
      )}
      {mediaCategoria != null && (
        <g aria-hidden="true">
          <line x1={xp(mediaCategoria)} y1="16" x2={xp(mediaCategoria)} y2={H - 4} stroke={COLORS.gold[500]} strokeWidth="1.3" strokeDasharray="3 3" />
          <text x={xp(mediaCategoria)} y="11" fill={COLORS.gold[500]} fontSize="8" textAnchor="middle" fontWeight="700">cat</text>
        </g>
      )}
      {filas.map((f, rank) => {
        const y = top + rank * rowH + rowH / 2;
        const sel = f.atletaId === seleccionadoId;
        const color = sel
          ? COLORS.gold[500]
          : (esBueno(f.valor) ? COLORS.feedback.successSoft : COLORS.feedback.cautionSoft);
        const seleccionar = () => onSelect(f.atletaId);
        return (
          <g
            key={f.atletaId}
            role="button"
            tabIndex={0}
            aria-pressed={sel}
            aria-label={`${f.nombre}: ${f.valor}${unidad ? ` ${unidad}` : ''}`}
            onClick={seleccionar}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionar(); }
            }}
            className="cursor-pointer focus:outline-none focus-visible:outline-2 focus-visible:outline-brand"
          >
            <rect x="0" y={y - 13} width={W} height="26" rx="6" fill={sel ? FILA_SELECCIONADA : 'transparent'} />
            <text x="6" y={y} fill={sel ? COLORS.gold[500] : COLORS.fg.secondary} fontSize="11" fontWeight={sel ? 800 : 600} dominantBaseline="middle">
              {primerNombre(f.nombre)}
            </text>
            <line x1={x0} y1={y} x2={x1} y2={y} stroke={LINEA_FILA} strokeWidth="1" />
            <circle
              cx={xp(f.valor)} cy={y} r={sel ? 6 : 4.5} fill={color}
              stroke={sel ? COLORS.fg.inverse : 'none'} strokeWidth={sel ? 1.5 : 0}
            />
            {sel && (
              <text x={xp(f.valor)} y={y - 10} fill={COLORS.gold[500]} fontSize="9" fontWeight="800" textAnchor="middle">
                {f.valor}{unidad}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────
// Gráfico 2 — bullet atleta vs medias (SVG propio, geometría cmpBullet)
// ────────────────────────────────────────────────────────────────
function BulletChart({ nombre, valor, mediaCategoria, mediaClub, unidad }) {
  const W = 330, H = 58, x0 = 14, x1 = 316, y = 32;

  const todos = [valor, mediaCategoria, mediaClub].filter(v => v != null);
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);
  const pad = (hi - lo) * 0.5 || 1;
  lo -= pad; hi += pad;
  const xp = v => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`${nombre}: ${valor}${unidad ? ` ${unidad}` : ''}, comparado con la media de la categoría y la del club`}>
      <title>{nombre} frente a la media de la categoría y la del club</title>
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
      {mediaClub != null && (
        <g aria-hidden="true">
          <line x1={xp(mediaClub)} y1={y - 9} x2={xp(mediaClub)} y2={y + 9} stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
          <text x={xp(mediaClub)} y={y + 20} fill={CHART.label} fontSize="8" textAnchor="middle">club</text>
        </g>
      )}
      {mediaCategoria != null && (
        <g aria-hidden="true">
          <line x1={xp(mediaCategoria)} y1={y - 9} x2={xp(mediaCategoria)} y2={y + 9} stroke={COLORS.gold[600]} strokeWidth="2" />
          <text x={xp(mediaCategoria)} y={y + 20} fill={COLORS.gold[600]} fontSize="8" textAnchor="middle">cat</text>
        </g>
      )}
      <circle cx={xp(valor)} cy={y} r="8" fill={COLORS.gold[500]} stroke={COLORS.fg.inverse} strokeWidth="1.5" />
      <text x={xp(valor)} y={y - 13} fill={COLORS.gold[500]} fontSize="10" fontWeight="900" textAnchor="middle">
        {primerNombre(nombre)} {valor}{unidad}
      </text>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────
// Skeleton de carga (clase .skeleton del design system)
// ────────────────────────────────────────────────────────────────
function CompararSkeleton() {
  return (
    <div className="max-w-3xl space-y-4" aria-hidden="true">
      <div className="skeleton h-9 w-2/3" />
      <div className="skeleton h-9 w-full" />
      <div className="skeleton h-64 w-full rounded-card" />
      <div className="skeleton h-28 w-full rounded-card" />
      <div className="skeleton h-56 w-full rounded-card" />
    </div>
  );
}

function MensajeVacio({ children }) {
  return (
    <p className="text-fg-muted text-xs font-bold text-center py-8">{children}</p>
  );
}

// ────────────────────────────────────────────────────────────────
// Vista Comparar
// ────────────────────────────────────────────────────────────────
// Referencias estables para el estado sin datos (evita recrear arrays en cada
// render y romper la memoización de los agregados).
const SIN_ATLETAS = [];
const SIN_CATALOGO = [];

export default function CompararPruebas({ user }) {
  // Carga en un solo estado, escrito únicamente tras los await (nunca setState
  // síncrono en el cuerpo del efecto): 'cargando' | 'error' | 'ok' + datos.
  const [carga, setCarga] = useState({ estado: 'cargando' });

  const [categoriaElegida, setCategoriaElegida] = useState('');
  const [pruebaElegida, setPruebaElegida] = useState('');
  const [atletaElegido, setAtletaElegido] = useState(null);

  // El coach con categoría asignada queda fijado a ella (sin alternativas).
  const categoriaFijaCoach =
    user?.rol === 'coach' && user?.categoria && user.categoria !== 'Todas'
      ? user.categoria
      : null;

  useEffect(() => {
    if (!user) return undefined;
    let cancelado = false;
    (async () => {
      try {
        // Las evaluaciones dependen solo de los ids de atletas (UNA query con
        // todos los visibles; la partición por categoría es client-side), así
        // que el catálogo corre en paralelo a la cadena atletas→evaluaciones.
        const [{ lista, evaluaciones }, dataCatalogo] = await Promise.all([
          fetchTodosLosAtletas(user).then(async (dataAtletas) => {
            const atletasVisibles = Array.isArray(dataAtletas) ? dataAtletas : [];
            return {
              lista: atletasVisibles,
              evaluaciones: await fetchEvaluacionesDeAtletas(atletasVisibles.map(a => a.atleta_id)),
            };
          }),
          fetchCatalogoPruebas(),
        ]);
        if (cancelado) return;
        setCarga({ estado: 'ok', atletas: lista, catalogo: dataCatalogo, evaluacionesPorAtleta: evaluaciones });
      } catch (err) {
        console.error('Error cargando la vista Comparar:', err);
        if (!cancelado) setCarga({ estado: 'error' });
      }
    })();
    return () => { cancelado = true; };
  }, [user]);

  const atletas = carga.estado === 'ok' ? carga.atletas : SIN_ATLETAS;
  const catalogo = carga.estado === 'ok' ? carga.catalogo : SIN_CATALOGO;
  const evaluacionesPorAtleta = carga.estado === 'ok' ? carga.evaluacionesPorAtleta : null;

  // Categorías FEB presentes entre los atletas visibles, en orden canónico.
  const categoriasPresentes = useMemo(() => {
    if (categoriaFijaCoach) return [categoriaFijaCoach];
    const presentes = new Set(atletas.map(a => a.categoria).filter(Boolean));
    return CATEGORIAS_FEB.filter(c => presentes.has(c));
  }, [atletas, categoriaFijaCoach]);

  // Pruebas del catálogo con al menos una medición entre los atletas visibles
  // (comparar una prueba jamás registrada solo produce estados vacíos).
  const pruebasDisponibles = useMemo(() => {
    if (!evaluacionesPorAtleta) return [];
    const conDatos = new Set();
    Object.values(evaluacionesPorAtleta).forEach(evaluaciones => {
      (evaluaciones || []).forEach(e => { if (e.prueba_tipo) conDatos.add(e.prueba_tipo); });
    });
    return catalogo.filter(p => conDatos.has(p.nombre));
  }, [catalogo, evaluacionesPorAtleta]);

  // Selecciones efectivas sin estado derivado redundante: si el usuario aún no
  // eligió (o su elección dejó de existir), cae al primer valor disponible.
  const categoriaActiva = categoriasPresentes.includes(categoriaElegida)
    ? categoriaElegida
    : categoriasPresentes[0] || null;
  const pruebaActiva = pruebasDisponibles.some(p => p.nombre === pruebaElegida)
    ? pruebaElegida
    : pruebasDisponibles[0]?.nombre || null;

  const pruebaInfo = useMemo(
    () => pruebasDisponibles.find(p => p.nombre === pruebaActiva) || null,
    [pruebasDisponibles, pruebaActiva],
  );
  const unidad = pruebaInfo?.unidad || '';
  const invertido = Boolean(pruebaInfo?.invertido);

  const atletasCategoria = useMemo(
    () => atletas.filter(a => a.categoria === categoriaActiva),
    [atletas, categoriaActiva],
  );
  const nombrePorAtletaId = useMemo(() => {
    const mapa = new Map();
    atletas.forEach(a => mapa.set(a.atleta_id, a.nombre));
    return mapa;
  }, [atletas]);

  // Agregados de la prueba activa: filas de la categoría (ordenadas de mejor a
  // peor según la dirección de la prueba) + media de categoría y de club.
  const { filas, mediaCategoria, mediaClub } = useMemo(() => {
    if (!evaluacionesPorAtleta || !pruebaActiva) {
      return { filas: [], mediaCategoria: null, mediaClub: null };
    }
    const evaluacionesCategoria = {};
    atletasCategoria.forEach(a => {
      evaluacionesCategoria[a.atleta_id] = evaluacionesPorAtleta[a.atleta_id] || [];
    });
    const categoria = compararPruebaGrupo(evaluacionesCategoria, pruebaActiva);
    const club = compararPruebaGrupo(evaluacionesPorAtleta, pruebaActiva);
    const ordenadas = categoria.atletas
      .map(({ atletaId, valor }) => ({ atletaId, valor, nombre: nombrePorAtletaId.get(atletaId) || '—' }))
      .sort((a, b) => (invertido ? a.valor - b.valor : b.valor - a.valor));
    return { filas: ordenadas, mediaCategoria: categoria.media, mediaClub: club.media };
  }, [evaluacionesPorAtleta, atletasCategoria, pruebaActiva, invertido, nombrePorAtletaId]);

  // Atleta seleccionado efectivo: la elección del usuario si sigue en las
  // filas visibles; si no, auto-selecciona el primero (el mejor).
  const atletaActivo = filas.some(f => f.atletaId === atletaElegido)
    ? atletaElegido
    : filas[0]?.atletaId || null;
  const filaActiva = filas.find(f => f.atletaId === atletaActivo) || null;

  // Histórico del atleta seleccionado en la prueba activa: fechas reales,
  // promediando por día para colapsar los dos lados de una prueba bilateral.
  const serieHistorico = useMemo(() => {
    if (!evaluacionesPorAtleta || !atletaActivo || !pruebaActiva) return [];
    const serie = seriePorPrueba(evaluacionesPorAtleta[atletaActivo] || [], pruebaActiva)
      .filter(p => p.valor_crudo != null);
    const porDia = new Map();
    serie.forEach(p => {
      const dia = String(p.fecha).slice(0, 10);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(p.valor_crudo);
    });
    return [...porDia.entries()].map(([dia, valores]) => ({
      fecha: dia,
      fechaCorta: fechaCorta(dia),
      valor: Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100,
    }));
  }, [evaluacionesPorAtleta, atletaActivo, pruebaActiva]);

  // Dominio Y del histórico: debe abarcar también las medias de referencia,
  // si no Recharts recorta las ReferenceLine fuera del rango de los datos.
  const dominioY = useMemo(() => {
    const valores = [...serieHistorico.map(p => p.valor), mediaCategoria, mediaClub]
      .filter(v => v != null);
    if (valores.length === 0) return [0, 1];
    let lo = Math.min(...valores);
    let hi = Math.max(...valores);
    const pad = (hi - lo) * 0.2 || 1;
    return [Math.round((lo - pad) * 100) / 100, Math.round((hi + pad) * 100) / 100];
  }, [serieHistorico, mediaCategoria, mediaClub]);

  if (carga.estado === 'cargando') return <CompararSkeleton />;

  if (carga.estado === 'error') {
    return (
      <div className="max-w-3xl glass-card rounded-card border border-danger/25 p-6">
        <MensajeVacio>No se pudieron cargar los datos. Intenta de nuevo.</MensajeVacio>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Encabezado */}
      <div className="flex items-center space-x-3">
        <GitCompareArrows className="text-brand drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" size={26} />
        <div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            Comparar <span className="text-gradient-gold">Pruebas</span>
          </h2>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-extrabold tracking-wide text-brand bg-brand/10 border border-brand/25">
            📊 Entre atletas · vs media de categoría y club · histórico
          </span>
        </div>
      </div>

      {atletas.length === 0 ? (
        <div className="glass-card rounded-card border border-white/10 p-6">
          <MensajeVacio>No hay atletas visibles para comparar.</MensajeVacio>
        </div>
      ) : pruebasDisponibles.length === 0 ? (
        <div className="glass-card rounded-card border border-white/10 p-6">
          <MensajeVacio>
            Aún no hay evaluaciones registradas. Cuando registres pruebas, aparecerán aquí para comparar.
          </MensajeVacio>
        </div>
      ) : (
        <>
          {/* Selector de categoría */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Categoría">
            <span className="text-2xs text-fg-faint font-bold uppercase tracking-eyebrow mr-1">Categoría</span>
            {categoriaFijaCoach ? (
              <span className="rounded-full px-3 py-1.5 text-xs font-extrabold border bg-brand/10 border-brand text-brand">
                {categoriaFijaCoach}
              </span>
            ) : (
              categoriasPresentes.map(cat => {
                const activa = cat === categoriaActiva;
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => setCategoriaElegida(cat)}
                    className={`rounded-full px-3 py-1.5 text-xs font-extrabold border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                      activa
                        ? 'bg-brand/10 border-brand text-brand'
                        : 'bg-surface-card border-white/10 text-fg-secondary hover:border-brand/30 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })
            )}
          </div>

          {/* Selector de prueba (subchips del mockup) */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Prueba">
            <span className="text-2xs text-fg-faint font-bold uppercase tracking-eyebrow mr-1">Prueba</span>
            {pruebasDisponibles.map(p => {
              const activa = p.nombre === pruebaActiva;
              return (
                <button
                  key={p.nombre}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setPruebaElegida(p.nombre)}
                  className={`rounded-full px-3 py-1.5 text-xs font-extrabold border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                    activa
                      ? 'bg-brand/10 border-brand text-brand'
                      : 'bg-surface-card border-white/10 text-fg-secondary hover:border-brand/30 hover:text-white'
                  }`}
                >
                  {p.nombre}
                </button>
              );
            })}
          </div>

          {/* Gráfico 1 — distribución de la categoría */}
          <motion.div {...VARIANTS.fadeInUp} className="glass-card rounded-card border border-white/10 p-5 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="min-w-0 truncate text-2xs text-fg-muted font-extrabold uppercase tracking-eyebrow">
                Distribución en {categoriaActiva}
              </h3>
              <span className="shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-bold text-brand bg-brand/10 border border-brand/25">
                {pruebaActiva}{unidad ? ` · ${unidad}` : ''}
              </span>
            </div>
            {filas.length === 0 ? (
              <MensajeVacio>
                Sin evaluaciones de “{pruebaActiva}” en {categoriaActiva}. Registra esta prueba para ver la distribución.
              </MensajeVacio>
            ) : (
              <>
                <DistribucionChart
                  filas={filas}
                  mediaCategoria={mediaCategoria}
                  mediaClub={mediaClub}
                  unidad={unidad}
                  invertido={invertido}
                  seleccionadoId={atletaActivo}
                  onSelect={setAtletaElegido}
                />
                <p className="text-xs text-fg-muted mt-3 leading-relaxed">
                  Cada punto es un atleta — <span className="font-bold text-fg-secondary">toca</span> para elegir.{' '}
                  <span className="text-success-soft">Verde</span> = del lado bueno de la media de la categoría,{' '}
                  <span className="text-caution-soft">naranja</span> = del otro. Líneas:{' '}
                  <span className="text-brand">media categoría</span> · <span className="text-fg-secondary">media club</span>.
                </p>
              </>
            )}
          </motion.div>

          {/* Gráfico 2 — bullet atleta vs medias */}
          {filaActiva && (
            <motion.div {...VARIANTS.fadeInUp} className="glass-card rounded-card border border-white/10 p-5 md:p-6">
              <h3 className="truncate text-2xs text-fg-muted font-extrabold uppercase tracking-eyebrow mb-4">
                {filaActiva.nombre} vs categoría vs club
              </h3>
              <BulletChart
                nombre={filaActiva.nombre}
                valor={filaActiva.valor}
                mediaCategoria={mediaCategoria}
                mediaClub={mediaClub}
                unidad={unidad}
              />
            </motion.div>
          )}

          {/* Gráfico 3 — histórico del atleta seleccionado */}
          {filaActiva && (
            <motion.div {...VARIANTS.fadeInUp} className="glass-card rounded-card border border-white/10 p-5 md:p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="min-w-0 truncate text-2xs text-fg-muted font-extrabold uppercase tracking-eyebrow">
                  Histórico de {filaActiva.nombre}
                </h3>
                <span className="shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-bold text-brand bg-brand/10 border border-brand/25">
                  {serieHistorico.length} medición{serieHistorico.length !== 1 ? 'es' : ''}
                </span>
              </div>
              {serieHistorico.length === 0 ? (
                <MensajeVacio>Sin mediciones de esta prueba para este atleta.</MensajeVacio>
              ) : (
                <>
                  {serieHistorico.length === 1 && (
                    <p className="text-3xs text-fg-faint font-bold text-center mb-2">
                      Una sola medición registrada — se necesitan ≥2 evaluaciones para ver la tendencia.
                    </p>
                  )}
                  <div className="h-52" role="img" aria-label={`Evolución de ${filaActiva.nombre} en ${pruebaActiva}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serieHistorico} margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="fechaCorta" stroke="rgba(255,255,255,0.15)" fontSize={9} tickMargin={8} tick={{ fill: CHART.axis }} />
                        <YAxis domain={dominioY} stroke="rgba(255,255,255,0.15)" fontSize={9} width={46} tick={{ fill: CHART.axis }} />
                        {mediaCategoria != null && (
                          <ReferenceLine
                            y={mediaCategoria} stroke={COLORS.gold[600]} strokeDasharray="4 3"
                            label={{ value: 'media cat', fill: COLORS.gold[600], fontSize: 9, position: 'insideTopRight' }}
                          />
                        )}
                        {mediaClub != null && (
                          <ReferenceLine
                            y={mediaClub} stroke={LINEA_CLUB} strokeDasharray="4 3"
                            label={{ value: 'club', fill: CHART.label, fontSize: 9, position: 'insideBottomRight' }}
                          />
                        )}
                        <Tooltip
                          contentStyle={{
                            backgroundColor: CHART.tooltip.background,
                            border: CHART.tooltip.border,
                            borderRadius: `${CHART.tooltip.borderRadius}px`,
                            color: CHART.tooltip.color,
                            fontSize: '11px',
                          }}
                          labelStyle={{ color: CHART.label, fontSize: '10px', marginBottom: '4px' }}
                          formatter={(val) => [`${val}${unidad ? ` ${unidad}` : ''}`, pruebaActiva]}
                        />
                        <Line
                          type="monotone" dataKey="valor"
                          stroke={COLORS.gold[500]} strokeWidth={2.5}
                          dot={{ fill: COLORS.gold[500], r: 4, strokeWidth: 2, stroke: COLORS.surface.base }}
                          activeDot={{ r: 6, fill: COLORS.gold[500], stroke: COLORS.surface.base, strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-fg-muted mt-3 leading-relaxed">
                    Su evolución en {pruebaActiva}, con la media de la categoría y la del club como referencia.
                  </p>
                </>
              )}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
