import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from 'recharts';
import { ChevronDown, Users, Loader2 } from 'lucide-react';
import { fetchEvaluacionesDeAtletas } from '../api/evaluacionesService';
// Agregados grupales compartidos (fuente única en analytics-core).
import { agregarDebilidadesGrupo, serieGrupalPorSubPilar } from '../../../packages/analytics-core/tendencias.js';
import { scoreATier } from '../../../packages/analytics-core/recomendaciones.js';

const SUB_PILAR_LABELS = {
  fuerza: 'Fuerza', explosividad: 'Explosividad', movilidad: 'Movilidad',
  tiro: 'Tiro', agilidad: 'Agilidad', tactica: 'Táctica', resiliencia: 'Resiliencia',
};

// Color de barra según el tier del promedio del grupo.
const TIER_BAR_COLORS = {
  poor: '#f87171',
  below_avg: '#fb923c',
  average: '#22d3ee',
  above_avg: '#FFD700',
  excellent: '#34d399',
};

/**
 * Panel colapsable "Tendencias del grupo" para el dashboard del coach:
 * (a) debilidad agregada por sub-pilar de los atletas visibles (ya filtrados), y
 * (b) evolución mensual multi-punto del sub-pilar seleccionado.
 * Lazy: no consulta la base hasta que el coach lo expande.
 */
export default function GrupoTendencias({ atletas }) {
  const [abierto, setAbierto] = useState(false);
  const [loading, setLoading] = useState(false);
  // Cache atado a la clave del conjunto de atletas: si los filtros del coach
  // cambian el grupo, la clave deja de coincidir y se recarga al expandir —
  // sin effects de invalidación (evita setState síncrono en useEffect).
  const [cache, setCache] = useState(null); // { key, data }
  const [subPilarActivo, setSubPilarActivo] = useState(null);

  const atletaIds = useMemo(
    () => (atletas || []).map(a => a.atleta_id || a.id).filter(Boolean),
    [atletas],
  );
  const idsKey = atletaIds.join(',');
  const evaluacionesPorAtleta = cache?.key === idsKey ? cache.data : null;

  const cargarGrupo = async () => {
    setLoading(true);
    setSubPilarActivo(null);
    try {
      const data = await fetchEvaluacionesDeAtletas(atletaIds);
      setCache({ key: idsKey, data });
    } catch (err) {
      console.error('Error cargando evaluaciones del grupo:', err);
      setCache({ key: idsKey, data: {} });
    }
    setLoading(false);
  };

  // Carga perezosa disparada por la interacción (no por effect): al expandir
  // con datos ausentes o invalidados por cambio de filtros, se consulta.
  const handleToggle = () => {
    const abriendo = !abierto;
    setAbierto(abriendo);
    if (abriendo && cache?.key !== idsKey && !loading) cargarGrupo();
  };

  const debilidades = useMemo(() => {
    if (!evaluacionesPorAtleta) return [];
    return agregarDebilidadesGrupo(evaluacionesPorAtleta).map(d => ({
      ...d,
      label: SUB_PILAR_LABELS[d.sub_pilar] || d.sub_pilar,
      color: TIER_BAR_COLORS[scoreATier(d.scorePromedio)] || '#9ca3af',
    }));
  }, [evaluacionesPorAtleta]);

  const serieMensual = useMemo(() => {
    if (!evaluacionesPorAtleta || !subPilarActivo) return [];
    return serieGrupalPorSubPilar(evaluacionesPorAtleta, subPilarActivo);
  }, [evaluacionesPorAtleta, subPilarActivo]);

  if (!atletas || atletas.length === 0) return null;

  return (
    <div className="mt-8 bg-[#0d0d0f] border border-white/10 rounded-2xl overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Users size={16} className="text-[#FFD700]" />
          <span className="text-xs font-black uppercase tracking-widest text-white">Tendencias del grupo</span>
          <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">
            {atletas.length} atleta{atletas.length !== 1 ? 's' : ''} (según filtros)
          </span>
        </div>
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-5">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-[#FFD700]">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !evaluacionesPorAtleta ? (
                /* Los filtros cambiaron con el panel abierto: la carga previa ya
                   no corresponde al grupo visible. */
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                  <p className="text-gray-600 text-xs font-bold">El grupo visible cambió.</p>
                  <button onClick={cargarGrupo}
                    className="px-4 py-2 bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 hover:bg-[#FFD700]/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors">
                    Actualizar tendencias
                  </button>
                </div>
              ) : debilidades.length === 0 ? (
                <p className="text-gray-600 text-xs font-bold text-center py-8">
                  Sin evaluaciones registradas en este grupo — evalúa atletas para ver su tendencia agregada.
                </p>
              ) : (
                <>
                  {/* (a) Debilidad agregada por sub-pilar (peor → mejor) */}
                  <div>
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-3">
                      Debilidad del grupo (clic en una barra para ver su evolución)
                    </p>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={debilidades} margin={{ top: 18, right: 5, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                          <XAxis dataKey="label" stroke="rgba(255,255,255,0.15)" fontSize={9} tick={{ fill: '#6b7280' }} />
                          <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.15)" fontSize={9} tick={{ fill: '#6b7280' }} ticks={[0, 25, 50, 75, 100]} />
                          <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                            contentStyle={{ backgroundColor: '#18181B', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '12px', fontSize: '11px' }}
                            formatter={(val, _n, { payload }) => [
                              `${val}/100 — ${payload.atletasDebiles} de ${payload.totalAtletasConDatos} atletas débiles`,
                              'Promedio del grupo',
                            ]}
                          />
                          <Bar dataKey="scorePromedio" radius={[6, 6, 0, 0]} cursor="pointer"
                            onClick={(data) => data?.sub_pilar && setSubPilarActivo(data.sub_pilar)}>
                            <LabelList dataKey="scorePromedio" position="top" fill="#9ca3af" fontSize={9} />
                            {debilidades.map(d => (
                              <Cell key={d.sub_pilar} fill={d.color}
                                opacity={subPilarActivo && subPilarActivo !== d.sub_pilar ? 0.35 : 0.9} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* (b) Evolución mensual del sub-pilar seleccionado */}
                  {subPilarActivo && (
                    <div>
                      <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-3">
                        Evolución mensual — {SUB_PILAR_LABELS[subPilarActivo] || subPilarActivo}
                      </p>
                      {serieMensual.length === 0 ? (
                        <p className="text-gray-600 text-xs font-bold text-center py-4">Sin mediciones de este sub-pilar.</p>
                      ) : (
                        <>
                          {serieMensual.length === 1 && (
                            <p className="text-[9px] text-gray-600 font-bold text-center mb-2">
                              Un solo mes con datos — con ≥2 meses se verá la tendencia.
                            </p>
                          )}
                          <div className="h-40">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={serieMensual} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="mes" stroke="rgba(255,255,255,0.15)" fontSize={9} tick={{ fill: '#6b7280' }} />
                                <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.15)" fontSize={9} tick={{ fill: '#6b7280' }} ticks={[0, 25, 50, 75, 100]} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#18181B', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '12px', fontSize: '11px' }}
                                  formatter={(val, _n, { payload }) => [`${val}/100 (${payload.n} medición${payload.n !== 1 ? 'es' : ''})`, 'Promedio del grupo']}
                                />
                                <Line type="monotone" dataKey="score" stroke="#FFD700" strokeWidth={2.5}
                                  dot={{ fill: '#FFD700', r: 4, strokeWidth: 2, stroke: '#09090b' }}
                                  activeDot={{ r: 6, fill: '#FFD700', stroke: '#09090b', strokeWidth: 2 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
