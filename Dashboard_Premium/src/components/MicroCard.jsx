import React from 'react';
import { motion } from 'framer-motion';
import { Ruler, TrendingUp, Star, Heart, Droplets } from 'lucide-react';
import { getSubPilarScores } from '../lib/radarCalc';

// MicroCard solo se renderiza para Premini/Mini (ver App.jsx), así que solo esas dos
// categorías FEB reales necesitan color; el resto usa el fallback gris de abajo.
const CATEGORY_COLORS = {
  'Premini (Sub-9)': 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  'Mini (Sub-11)': 'text-blue-400 border-blue-500/30 bg-blue-500/10',
};

function calcularIndiceCormica(atleta) {
  const { longitud_torso_cm, altura_cm } = atleta;
  if (!longitud_torso_cm || !altura_cm || altura_cm === 0) return null;
  return ((longitud_torso_cm / altura_cm) * 100).toFixed(1);
}



function MiniBar({ label, value, icon: Icon, color = 'bg-[#FFD700]' }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center space-x-1.5">
          {Icon && <Icon size={11} className="text-gray-400" />}
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
        </div>
        <span className="text-[9px] font-black text-white">{value}/100</span>
      </div>
      <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

export default function MicroCard({ atleta }) {
  const categoryColorClass = CATEGORY_COLORS[atleta.categoria] || 'text-gray-400 border-white/20 bg-white/5';
  const indiceCormica = calcularIndiceCormica(atleta);

  const subPilarScores = getSubPilarScores(atleta._evaluaciones || []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="glass-card rounded-3xl p-8 relative overflow-hidden border border-white/5"
    >
      {/* Ambient glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[80px] pointer-events-none opacity-40 bg-[#FFD700]" />

      {/* Avatar + Header */}
      <div className="flex flex-col items-center text-center mb-6 relative z-10">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FFD700]/20 to-[#FFD700]/5 border-2 border-[#FFD700]/30 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(255,215,0,0.15)]">
          <span className="text-3xl font-black text-[#FFD700]">{atleta.nombre?.charAt(0)?.toUpperCase()}</span>
        </div>
        <h3 className="text-2xl font-black text-white tracking-tight">{atleta.nombre}</h3>
        <div className="flex items-center space-x-2 mt-2">
          <span className="text-[10px] text-gray-400 font-bold">{atleta.edad} años</span>
          <span className="text-gray-600">·</span>
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${categoryColorClass}`}>
            {atleta.categoria}
          </span>
        </div>
      </div>

      {/* Ficha de Crecimiento */}
      <div className="relative z-10 bg-white/3 border border-white/8 rounded-2xl p-4 mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center space-x-1.5">
          <Ruler size={10} />
          <span>Ficha de Crecimiento</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1">Altura</p>
            <p className="text-xl font-black text-white">{atleta.altura_cm || '—'}</p>
            <p className="text-[8px] text-gray-500">cm</p>
          </div>
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1">Índ. Córmico</p>
            <p className="text-xl font-black text-white">{indiceCormica ? `${indiceCormica}%` : '—'}</p>
            <p className="text-[8px] text-gray-500">Torso / Total</p>
          </div>
        </div>
      </div>



      {/* Métricas Clave y Readiness */}
      <div className="relative z-10 space-y-3">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">Métricas Clave</p>
        <MiniBar label="Resiliencia" value={subPilarScores.resiliencia || 0} icon={Heart} color="bg-[#FFD700]" />
        <MiniBar label="Fuerza" value={subPilarScores.fuerza || 0} icon={Star} color="bg-emerald-500" />
        <MiniBar label="Agilidad" value={subPilarScores.agilidad || 0} icon={TrendingUp} color="bg-blue-400" />
        
        <div className="mt-4 pt-3 border-t border-white/5">
           <div className="flex justify-between items-center">
             <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-1">
               <Droplets size={10} /> Estado (Check-in)
             </p>
             <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
               atleta.estado_recuperacion === 'Óptimo' ? 'bg-emerald-500/20 text-emerald-400' :
               atleta.estado_recuperacion === 'Fatiga Silenciosa' ? 'bg-amber-500/20 text-amber-400' :
               'bg-red-500/20 text-red-400'
             }`}>
               {atleta.estado_recuperacion || 'Sin Datos'}
             </span>
           </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-5 pt-4 border-t border-white/5 text-center">
        <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-[#FFD700]/60">
          ⭐ Fase de Desarrollo Multilateral
        </span>
      </div>
    </motion.div>
  );
}
