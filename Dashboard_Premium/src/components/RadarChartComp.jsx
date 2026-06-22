import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { build3LayerRadarData, getSubPilarScores } from '../lib/radarCalc.js';

export default function RadarChartComp({ atleta, todosLosAtletas, showCategoria = true, showClub = true, isAnimationActive = true }) {
  const strokeColor = '#FFD700';
  const fillColor = '#FFD700';

  // Build 3-layer data if todosLosAtletas is provided
  const use3Layer = todosLosAtletas && todosLosAtletas.length > 0;

  let data = [];
  if (use3Layer) {
    const atletaScores = getSubPilarScores(atleta._evaluaciones || []);
    const mismaCategoria = todosLosAtletas.filter(a => a.categoria === atleta.categoria);
    const categoriaScores = mismaCategoria.map(a => getSubPilarScores(a._evaluaciones || []));
    const clubScores = todosLosAtletas.map(a => getSubPilarScores(a._evaluaciones || []));
    
    data = build3LayerRadarData(atletaScores, categoriaScores, clubScores);
  } else {
    const emptyScores = getSubPilarScores([]);
    // Even if no full DB, we might have local evaluations for the single athlete
    const localScores = getSubPilarScores(atleta._evaluaciones || []);
    data = [
      { subject: 'Fuerza', Atleta: localScores.fuerza || 0, fullMark: 100 },
      { subject: 'Explosividad', Atleta: localScores.explosividad || 0, fullMark: 100 },
      { subject: 'Movilidad', Atleta: localScores.movilidad || 0, fullMark: 100 },
      { subject: 'Técnica Tiro', Atleta: localScores.tiro || 0, fullMark: 100 },
      { subject: 'Agilidad', Atleta: localScores.agilidad || 0, fullMark: 100 },
      { subject: 'Efic. Táctica', Atleta: localScores.tactica || 0, fullMark: 100 },
      { subject: 'Resiliencia', Atleta: localScores.resiliencia || 0, fullMark: 100 },
    ];
  }

  return (
    <div className="w-full h-56 relative mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="60%" data={data}>
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
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              fill="#10b981"
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
            <div className="w-2 h-2 rounded-full bg-[#FFD700] shadow-[0_0_6px_rgba(255,215,0,0.5)]"></div>
            <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Atleta</span>
          </div>
          {showCategoria && (
            <div className="flex items-center space-x-1.5 opacity-80">
              <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
              <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Categoría</span>
            </div>
          )}
          {showClub && (
            <div className="flex items-center space-x-1.5 opacity-60">
              <div className="w-2 h-2 rounded-full bg-white/20"></div>
              <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Club</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
