import React from 'react';
import { motion } from 'framer-motion';
import { Droplets } from 'lucide-react';


// Recovery dot color
function recoveryDot(estado) {
  if (!estado || estado === 'Óptimo') return null;
  if (estado === 'Agotamiento Activo') return 'bg-amber-500';
  if (estado === 'Fatiga Silenciosa') return 'bg-purple-500';
  return 'bg-red-500';
}

export default function AthleteGridCard({ atleta, onClick }) {
  const dotColor = recoveryDot(atleta.estado_recuperacion);

  return (
    <motion.div
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 hover:border-[#FFD700]/30 transition-all cursor-pointer relative group"
    >
      {/* Recovery / Readiness alerts */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {atleta.readiness_hoy && atleta.readiness_hoy.color_orina >= 5 && (
          <span title={`Deshidratación (Color ${atleta.readiness_hoy.color_orina})`} className="text-[#FFD700] animate-pulse">
            <Droplets size={14} fill="currentColor" />
          </span>
        )}
        {dotColor && (
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor} animate-pulse`} 
                title={atleta.estado_recuperacion} />
        )}
      </div>

      {/* Top: Avatar + Identity */}
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <span className="text-lg font-black text-white/50 uppercase">{atleta.nombre?.charAt(0)}</span>
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white truncate text-sm group-hover:text-[#FFD700] transition-colors">
            {atleta.nombre}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {atleta.edad} años · {atleta.posicion}
          </p>
        </div>
      </div>

      {/* Rango badge and profile */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black uppercase tracking-widest ${atleta.rango?.textColor || 'text-gray-400'}`}>
            {atleta.rango?.nombre}
          </span>
          <span className="text-[9px] text-gray-500 font-bold">{atleta.rango?.tier}</span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          {atleta.perfil_mental && (
            <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
              {atleta.perfil_mental}
            </span>
          )}
          {atleta.prevencion_impacto && (
            <span title="Sensibilidad al Impacto" className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-orange-500/30 text-orange-400 bg-orange-500/5 flex items-center">
              ⚠ Impacto
            </span>
          )}
        </div>
      </div>

      {/* Mini metric pills - Anthropometry */}
      <div className="flex items-center gap-2 flex-wrap mt-2 pt-3 border-t border-white/5">
        <span title="Estatura" className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400">
          {atleta.talla_cm ? `${atleta.talla_cm} cm` : '—'}
        </span>
        <span title="Peso" className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-500/10 text-green-400">
          {atleta.peso_kg ? `${atleta.peso_kg} kg` : '—'}
        </span>
        <span title="Índice de Masa Corporal (IMC)" className="text-[10px] font-bold px-2 py-1 rounded-lg bg-purple-500/10 text-purple-400">
          IMC: {atleta.imc || '—'}
        </span>
        <span title="Brazada Relativa" className="text-[10px] font-bold px-2 py-1 rounded-lg bg-[#FFD700]/10 text-[#FFD700]">
          BR: {atleta.brazada_relativa || '—'}
        </span>
      </div>
    </motion.div>
  );
}
