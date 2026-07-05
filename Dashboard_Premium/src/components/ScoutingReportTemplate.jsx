import React, { forwardRef } from 'react';
import RadarChartComp from './RadarChartComp';

const ScoutingReportTemplate = forwardRef(({ atleta, todosLosAtletas }, ref) => {
  if (!atleta) return null;

  return (
    <div
      ref={ref}
      className="bg-surface-base text-white p-8 w-[800px] min-h-[1130px] flex flex-col font-sans"
      style={{ boxSizing: 'border-box' }}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between border-b-2 border-brand pb-6 mb-8">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-full border-2 border-brand overflow-hidden flex items-center justify-center bg-zinc-900">
            {atleta.foto_url ? (
              <img src={atleta.foto_url} alt="Atleta" className="w-full h-full object-cover" />
            ) : (
              <span className="text-zinc-500 font-bold uppercase text-xs text-center p-2">FOTO NO DISPONIBLE</span>
            )}
          </div>
          <div>
            <h1 className="text-4xl font-bold uppercase tracking-widest text-white mb-2 truncate max-w-[420px]">{atleta.nombre}</h1>
            <div className="flex gap-4 text-sm font-bold tracking-widest text-brand">
              <span>ID: {atleta.cedula}</span>
              <span>•</span>
              <span>{atleta.categoria || 'Sin Categoría'}</span>
              <span>•</span>
              <span>{atleta.posicion || 'Sin Posición'}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <img src="/pwa-192x192.png" alt="Black Gold Logo" className="w-16 h-16 ml-auto mb-2" />
          <h2 className="text-xl font-bold uppercase tracking-widest text-brand">BLACK GOLD</h2>
          <p className="text-xs text-fg-secondary uppercase tracking-widest">Scouting Report</p>
        </div>
      </div>

      {/* RANGO Y EXP */}
      <div className="flex justify-between items-center bg-zinc-900/50 p-6 rounded-panel mb-8 border border-white/5">
        <div>
          <p className="text-xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Rango Actual</p>
          <div className="text-2xl font-black uppercase text-white tracking-widest">{atleta.nivel || 'Bronce I'}</div>
        </div>
        <div className="text-right">
          <p className="text-xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Experiencia (XP)</p>
          <div className="text-2xl font-black text-brand">{atleta.xp_total || 0} XP</div>
        </div>
      </div>

      {/* PERFIL FÍSICO Y PSICOLÓGICO */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="text-lg font-bold uppercase tracking-widest text-brand mb-4 border-b border-white/10 pb-2">Perfil Biológico</h3>
          <div className="space-y-4">
            <MetricRow label="Fuerza Isométrica" value={atleta.fuerza} />
            <MetricRow label="Explosividad" value={atleta.explosividad} />
            <MetricRow label="Flexibilidad" value={atleta.flexibilidad} />
            <MetricRow label="Eficiencia Táctica" value={atleta.eficiencia_tactica} />
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold uppercase tracking-widest text-brand mb-4 border-b border-white/10 pb-2">Perfil Mental & Hábitos</h3>
          <div className="space-y-4">
            <MetricRow label="Resiliencia Psicológica" value={atleta.resiliencia_psicologica} isDanger={atleta.resiliencia_psicologica < 70} />
            <MetricRow label="Nutrición" value={atleta.nutricion} />
            <MetricRow label="Hidratación" value={atleta.hidratacion} />
          </div>
        </div>
      </div>

      {/* RADAR CHART COMPONENT */}
      <div className="flex-1 bg-zinc-900/30 rounded-panel border border-white/5 p-6 flex flex-col items-center justify-center relative">
        <h3 className="text-center text-sm font-bold uppercase tracking-widest text-fg-secondary mb-6 absolute top-6">Polígono de Habilidades Funcionales</h3>
        <div className="w-full h-80 mt-8">
          <RadarChartComp 
            atleta={atleta} 
            todosLosAtletas={todosLosAtletas} 
            showCategoria={true} 
            showClub={false} 
            isAnimationActive={false} 
          />
        </div>
      </div>

      {/* FOOTER */}
      <div className="mt-8 pt-6 border-t border-white/10 text-center">
        <p className="text-2xs text-fg-muted font-bold uppercase tracking-widest">Generado automáticamente por Black Gold Intelligence System</p>
        <p className="text-2xs text-fg-faint mt-1">{new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
});

ScoutingReportTemplate.displayName = 'ScoutingReportTemplate';

function MetricRow({ label, value, isDanger = false }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold uppercase tracking-widest text-fg-secondary">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full ${isDanger ? 'bg-danger' : 'bg-brand'}`} 
            style={{ width: `${value || 0}%` }}
          />
        </div>
        <span className={`text-sm font-bold w-8 text-right ${isDanger ? 'text-danger' : 'text-white'}`}>{value || 0}</span>
      </div>
    </div>
  );
}

// Memoizado: sus props (atleta, todosLosAtletas) son estables entre renders del padre
export default React.memo(ScoutingReportTemplate);
