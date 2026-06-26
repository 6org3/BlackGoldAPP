import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { fetchEvaluacionesAtleta } from '../api/evaluacionesService';

// Agrupación de prueba_tipo → pilar visual
const PILARES = [
  {
    id: 'fuerza',
    label: 'Fuerza',
    color: '#f97316',
    pruebas: ['curl_biceps', 'press_banca', 'sentadilla', 'fuerza'],
  },
  {
    id: 'explosividad',
    label: 'Explosividad',
    color: '#eab308',
    pruebas: ['salto_vertical', 'salto_largo', 'sprint_30m', 'explosividad'],
  },
  {
    id: 'movilidad',
    label: 'Movilidad',
    color: '#22c55e',
    pruebas: ['flexibilidad', 'movilidad_cadera', 'movilidad'],
  },
  {
    id: 'tiro',
    label: 'Técnica de Tiro',
    color: '#3b82f6',
    pruebas: ['tiro_libre', 'tiro_3p', 'tiro_2p', 'tiro'],
  },
  {
    id: 'agilidad',
    label: 'Agilidad',
    color: '#a855f7',
    pruebas: ['lane_agility', 'shuttle_run', 'agilidad'],
  },
  {
    id: 'tactica',
    label: 'Efic. Táctica',
    color: '#ec4899',
    pruebas: ['tactica', 'lectura_juego'],
  },
  {
    id: 'resiliencia',
    label: 'Resiliencia',
    color: '#FFD700',
    pruebas: ['resiliencia', 'mentalidad'],
  },
  {
    id: 'antropometrico',
    label: 'Antropométrico',
    color: '#06b6d4',
    pruebas: ['peso_kg', 'altura_cm', 'imc', 'envergadura_cm', 'brazada_relativa'],
  },
];

export default function HistorialPruebas({ atletaId }) {
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pilarActivo, setPilarActivo] = useState('fuerza');

  useEffect(() => {
    if (!atletaId) { setLoading(false); return; }
    fetchEvaluacionesAtleta(atletaId)
      .then(data => setEvaluaciones(data || []))
      .catch(err => console.error('Error historial:', err))
      .finally(() => setLoading(false));
  }, [atletaId]);

  // Construir series por pilar
  const seriesPorPilar = useMemo(() => {
    const result = {};
    PILARES.forEach(pilar => {
      const evals = evaluaciones
        .filter(e => pilar.pruebas.includes(e.prueba_tipo) || e.sub_pilar === pilar.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      // Agrupar por fecha (día)
      const porFecha = {};
      evals.forEach(e => {
        const key = new Date(e.created_at).toLocaleDateString('es-ES', {
          day: '2-digit', month: 'short',
        });
        if (!porFecha[key]) porFecha[key] = { fecha: key, scores: [] };
        if (e.puntuacion_normalizada != null) {
          porFecha[key].scores.push(e.puntuacion_normalizada);
        }
      });

      result[pilar.id] = Object.values(porFecha).map(({ fecha, scores }) => ({
        fecha,
        score: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
      })).filter(d => d.score !== null);
    });
    return result;
  }, [evaluaciones]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-[#FFD700]">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (evaluaciones.length === 0) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center h-48 text-center">
        <TrendingUp size={40} className="text-gray-700 mb-3" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Sin evaluaciones registradas</p>
        <p className="text-gray-700 text-xs mt-1">Cuando el coach registre pruebas, tu evolución aparecerá aquí.</p>
      </div>
    );
  }

  const pilarSeleccionado = PILARES.find(p => p.id === pilarActivo);
  const datos = seriesPorPilar[pilarActivo] || [];

  // Tendencia
  let Tendencia = Minus;
  let tendenciaColor = 'text-gray-500';
  if (datos.length >= 2) {
    const diff = datos[datos.length - 1].score - datos[0].score;
    if (diff > 3) { Tendencia = TrendingUp; tendenciaColor = 'text-emerald-400'; }
    else if (diff < -3) { Tendencia = TrendingDown; tendenciaColor = 'text-red-400'; }
  }

  const ultimo = datos.length > 0 ? datos[datos.length - 1].score : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Selector de pilar */}
      <div className="flex flex-wrap gap-2">
        {PILARES.map(p => {
          const serie = seriesPorPilar[p.id] || [];
          const activo = pilarActivo === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPilarActivo(p.id)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                activo
                  ? 'border-current text-white'
                  : 'border-white/10 text-gray-600 hover:text-gray-400 hover:border-white/20'
              }`}
              style={activo ? { borderColor: p.color, color: p.color, background: p.color + '15' } : {}}
            >
              {p.label}
              {serie.length > 0 && (
                <span className="ml-1 opacity-60">({serie.length})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Stats summary */}
      {datos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-3 text-center">
            <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest mb-1">Último</p>
            <p className="text-2xl font-black" style={{ color: pilarSeleccionado?.color }}>{ultimo}</p>
          </div>
          <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-3 text-center">
            <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest mb-1">Mejor</p>
            <p className="text-2xl font-black text-[#FFD700]">
              {Math.max(...datos.map(d => d.score))}
            </p>
          </div>
          <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-3 text-center">
            <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest mb-1">Tendencia</p>
            <div className="flex justify-center mt-1">
              <Tendencia size={24} className={tendenciaColor} />
            </div>
          </div>
        </div>
      )}

      {/* Gráfica */}
      <div className="bg-[#0d0d0f] border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <h3
            className="text-xs font-black uppercase tracking-widest"
            style={{ color: pilarSeleccionado?.color }}
          >
            {pilarSeleccionado?.label}
          </h3>
          <span className="text-[9px] text-gray-600 font-bold">
            {datos.length} medición{datos.length !== 1 ? 'es' : ''}
          </span>
        </div>

        {datos.length < 2 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-gray-600 text-xs font-bold">
              {datos.length === 0
                ? 'Sin datos para este pilar'
                : 'Se necesitan al menos 2 mediciones para mostrar la evolución'}
            </p>
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datos} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${pilarActivo}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={pilarSeleccionado?.color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={pilarSeleccionado?.color} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  stroke="rgba(255,255,255,0.15)"
                  fontSize={9}
                  tickMargin={8}
                  tick={{ fill: '#6b7280' }}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="rgba(255,255,255,0.15)"
                  fontSize={9}
                  tick={{ fill: '#6b7280' }}
                  ticks={[0, 25, 50, 75, 100]}
                />
                <ReferenceLine y={60} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" label={{ value: 'Meta', fill: '#4b5563', fontSize: 9, position: 'right' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181B',
                    border: `1px solid ${pilarSeleccionado?.color}33`,
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                  labelStyle={{ color: '#9CA3AF', fontSize: '10px', marginBottom: '4px' }}
                  formatter={(val) => [`${val} / 100`, pilarSeleccionado?.label]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={`url(#grad-${pilarActivo})`}
                  strokeWidth={2.5}
                  dot={{ fill: pilarSeleccionado?.color, r: 4, strokeWidth: 2, stroke: '#09090b' }}
                  activeDot={{ r: 6, fill: pilarSeleccionado?.color, stroke: '#09090b', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Detalle de evaluaciones recientes */}
      <div className="bg-[#0d0d0f] border border-white/5 rounded-2xl p-5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">
          Evaluaciones recientes — {pilarSeleccionado?.label}
        </h3>
        {datos.length === 0 ? (
          <p className="text-gray-700 text-xs font-bold text-center py-4">Sin registros</p>
        ) : (
          <div className="space-y-2">
            {[...datos].reverse().slice(0, 8).map((d, i) => (
              <motion.div
                key={d.fecha}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
              >
                <span className="text-[10px] text-gray-500 font-bold">{d.fecha}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${d.score}%`,
                        background: pilarSeleccionado?.color,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span
                    className="text-xs font-black w-8 text-right"
                    style={{ color: pilarSeleccionado?.color }}
                  >
                    {d.score}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
