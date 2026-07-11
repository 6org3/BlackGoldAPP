import { useState, useEffect, useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { build3LayerRadarData, getSubPilarScores } from '../lib/radarCalc.js';
import { COLORS, CHART } from '../lib/designTokens';

// Etiquetas abreviadas para que los ejes no se recorten en viewports angostos.
const ETIQUETAS_CORTAS = {
  'Explosividad': 'Explos.',
  'Efic. Táctica': 'Táctica',
  'Técnica Tiro': 'Tiro',
  'Resiliencia': 'Resil.',
  'Movilidad': 'Movil.',
};

function useEsMovil() {
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e) => setEsMovil(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return esMovil;
}

export default function RadarChartComp({ atleta, todosLosAtletas, showCategoria = true, showClub = true, isAnimationActive = true }) {
  const strokeColor = CHART.radar.stroke;
  const fillColor = CHART.radar.stroke;
  const esMovil = useEsMovil();

  // Build 3-layer data if todosLosAtletas is provided
  const use3Layer = !!(todosLosAtletas && todosLosAtletas.length > 0);
  const evaluaciones = atleta._evaluaciones;
  const categoria = atleta.categoria;

  // Memoizado: recorre las evaluaciones de todo el club (O(N×E)), no debe
  // recalcularse en cada re-render del padre (toggles, modales).
  const data = useMemo(() => {
    if (use3Layer) {
      const atletaScores = getSubPilarScores(evaluaciones || []);
      const mismaCategoria = todosLosAtletas.filter(a => a.categoria === categoria);
      const categoriaScores = mismaCategoria.map(a => getSubPilarScores(a._evaluaciones || []));
      const clubScores = todosLosAtletas.map(a => getSubPilarScores(a._evaluaciones || []));
      return build3LayerRadarData(atletaScores, categoriaScores, clubScores);
    }
    // Even if no full DB, we might have local evaluations for the single athlete
    const localScores = getSubPilarScores(evaluaciones || []);
    return [
      { subject: 'Fuerza', Atleta: localScores.fuerza || 0, fullMark: 100 },
      { subject: 'Explosividad', Atleta: localScores.explosividad || 0, fullMark: 100 },
      { subject: 'Movilidad', Atleta: localScores.movilidad || 0, fullMark: 100 },
      { subject: 'Técnica Tiro', Atleta: localScores.tiro || 0, fullMark: 100 },
      { subject: 'Agilidad', Atleta: localScores.agilidad || 0, fullMark: 100 },
      { subject: 'Efic. Táctica', Atleta: localScores.tactica || 0, fullMark: 100 },
      { subject: 'Resiliencia', Atleta: localScores.resiliencia || 0, fullMark: 100 },
    ];
  }, [use3Layer, evaluaciones, categoria, todosLosAtletas]);

  return (
    <div className="w-full h-64 sm:h-56 relative mt-4">
      {/* initialDimension: sin esto, Recharts mide el contenedor en el mismo
          tick del mount (antes de que el ResizeObserver reporte el tamaño
          real) y advierte "width(-1) height(-1)" — benigno hoy, pero es la
          misma condición de carrera que en un dispositivo lento deja el
          radar invisible (auditoría atleta 2026-07-09). El valor es solo
          la mejor suposición para el primer frame; el real llega enseguida. */}
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 256 }}>
        <RadarChart cx="50%" cy="50%" outerRadius={esMovil ? '68%' : '60%'} data={data}>
          <defs>
            <filter id={`glow-${atleta.id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          
          <PolarGrid stroke="rgba(255,255,255,0.08)" />
          
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: 700, letterSpacing: '0.5px' }}
            tickLine={false}
            tickFormatter={(v) => (esMovil ? ETIQUETAS_CORTAS[v] || v : v)}
          />
          
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />

          {/* Layer 1: Club (background) */}
          {use3Layer && showClub && (
            <Radar
              name="Club"
              dataKey="Club"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={1}
              fill="rgba(255,255,255,0.05)"
              fillOpacity={0.1}
            />
          )}

          {/* Layer 2: Categoría (middle) */}
          {use3Layer && showCategoria && (
            <Radar
              name="Categoría"
              dataKey="Categoria"
              stroke={COLORS.feedback.success}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              fill={COLORS.feedback.success}
              fillOpacity={0.08}
            />
          )}

          {/* Layer 3: Atleta (top) */}
          <Radar 
            name={atleta.nombre} 
            dataKey="Atleta" 
            stroke={strokeColor} 
            strokeWidth={2}
            fill={fillColor} 
            fillOpacity={0.2} 
            filter={`url(#glow-${atleta.id})`}
            isAnimationActive={isAnimationActive}
          />

          <Tooltip
            contentStyle={{
              background: 'rgba(10,10,12,0.95)',
              border: '1px solid rgba(255,215,0,0.2)',
              borderRadius: '12px',
              backdropFilter: 'blur(20px)',
              padding: '12px 16px',
            }}
            itemStyle={{ fontSize: '11px', fontWeight: 700 }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend */}
      {use3Layer && (
        <div className="flex items-center justify-center space-x-6 mt-1">
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-brand shadow-[0_0_6px_rgba(255,215,0,0.5)]"></div>
            <span className="text-3xs text-fg-secondary font-bold uppercase tracking-widest">Atleta</span>
          </div>
          {showCategoria && (
            <div className="flex items-center space-x-1.5 opacity-80">
              <div className="w-2 h-2 rounded-full bg-success"></div>
              <span className="text-3xs text-fg-secondary font-bold uppercase tracking-widest">Categoría</span>
            </div>
          )}
          {showClub && (
            <div className="flex items-center space-x-1.5 opacity-60">
              <div className="w-2 h-2 rounded-full bg-white/20"></div>
              <span className="text-3xs text-fg-secondary font-bold uppercase tracking-widest">Club</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
