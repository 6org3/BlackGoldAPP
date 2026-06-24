import React, { useState, useEffect, useMemo } from 'react';
import { MessageCircle, FileText, Calendar, TrendingUp, AlertTriangle, CheckCircle, CreditCard, Activity } from 'lucide-react';
import { fetchNotasCoach } from '../api/notasCoachService';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function PortalPadreSeccion({ atleta, subPilarScores }) {
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Teléfono de prueba para WhatsApp del Coach
  const coachWhatsApp = "+1234567890"; // Reemplazar con el teléfono real del coach

  useEffect(() => {
    loadNotas();
  }, [atleta.atleta_id]);

  const loadNotas = async () => {
    setLoading(true);
    const data = await fetchNotasCoach(atleta.atleta_id);
    setNotas(data || []);
    setLoading(false);
  };

  const histogramData = useMemo(() => {
    const evaluaciones = atleta._evaluaciones || [];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    // Sesiones del mes actual
    const mesActual = evaluaciones.filter(e => {
      const d = new Date(e.fecha_evaluacion);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).map(e => ({
      fecha: new Date(e.fecha_evaluacion).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      xp: Math.round(e.puntuacion_normalizada || 0)
    }));

    // Sesiones del mes anterior
    const mesAnterior = evaluaciones.filter(e => {
      const d = new Date(e.fecha_evaluacion);
      return d.getMonth() === (currentMonth === 0 ? 11 : currentMonth - 1) && d.getFullYear() === (currentMonth === 0 ? currentYear - 1 : currentYear);
    });

    const avgActual = mesActual.length ? Math.round(mesActual.reduce((acc, curr) => acc + curr.xp, 0) / mesActual.length) : 0;
    const avgAnterior = mesAnterior.length ? Math.round(mesAnterior.reduce((acc, curr) => acc + (curr.puntuacion_normalizada || 0), 0) / mesAnterior.length) : 0;

    return { data: mesActual, avgActual, avgAnterior, historico: atleta.overall_score || 0 };
  }, [atleta]);

  const getRecomendacion = () => {
    if (!subPilarScores) return null;
    
    // Convert scores to array to find lowest
    const scores = [
      { pilar: 'Fuerza', score: subPilarScores.fuerza || 0, req: 60, msg: 'Falta fuerza base para evitar lesiones en articulaciones. Se recomienda añadir rutinas isométricas en casa (3 días x semana).' },
      { pilar: 'Explosividad', score: subPilarScores.explosividad || 0, req: 65, msg: 'Requiere más potencia en el salto. Se recomiendan ejercicios pliométricos básicos.' },
      { pilar: 'Táctica', score: subPilarScores.tactica || 0, req: 50, msg: 'Debe mejorar su lectura de juego. Le asignaremos más misiones teóricas y análisis de video en la plataforma.' },
      { pilar: 'Movilidad', score: subPilarScores.movilidad || 0, req: 60, msg: 'Su movilidad articular es baja. Es vital realizar los estiramientos recomendados antes de dormir.' },
      { pilar: 'Resiliencia', score: subPilarScores.resiliencia || 0, req: 70, msg: 'Presenta frustración rápida en juegos. Reforzar la actitud positiva en casa y no enfocarse solo en ganar.' }
    ];

    const sorted = scores.sort((a, b) => a.score - b.score);
    const weakest = sorted[0];

    if (weakest.score < weakest.req) {
      return (
        <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 mt-4">
          <h6 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center mb-1">
            <AlertTriangle size={12} className="mr-1" /> Foco de Mejora: {weakest.pilar}
          </h6>
          <p className="text-xs text-amber-100/70">{weakest.msg}</p>
        </div>
      );
    }

    return (
      <div className="bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl p-4 mt-4">
        <h6 className="text-[10px] font-bold text-[#10b981] uppercase tracking-widest flex items-center mb-1">
          <CheckCircle size={12} className="mr-1" /> Desarrollo Óptimo
        </h6>
        <p className="text-xs text-[#10b981]/80">El atleta está cumpliendo o superando los baremos básicos para su categoría actual. ¡Sigan así!</p>
      </div>
    );
  };

  return (
    <div className="mt-8 pt-8 border-t border-white/10 relative z-10">
      <h4 className="text-[#FFD700] text-sm font-black uppercase tracking-[0.2em] mb-6 flex items-center">
        <FileText className="mr-2" size={18} />
        Portal del Representante
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Contacto Coach y Pagos */}
        <div className="md:col-span-1 flex flex-col space-y-4">
          <div className="bg-gradient-to-br from-[#128C7E]/10 to-[#075E54]/20 border border-[#25D366]/20 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-[#25D366]/20 rounded-full flex items-center justify-center mb-3">
              <MessageCircle size={24} className="text-[#25D366]" />
            </div>
            <h5 className="text-white font-bold mb-1">Línea Directa</h5>
            <p className="text-[10px] text-gray-400 mb-4">Comunícate por inasistencias o feedback privado.</p>
            
            <a 
              href={`https://wa.me/${coachWhatsApp}?text=Hola Coach, soy representante de ${atleta.nombre}.`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white text-[10px] font-black uppercase tracking-widest py-2 px-4 rounded-xl shadow-[0_0_15px_rgba(37,211,102,0.3)] transition-all flex items-center justify-center"
            >
              <MessageCircle size={14} className="mr-2" />
              WhatsApp
            </a>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h5 className="text-white font-bold mb-2 flex items-center">
              <CreditCard size={14} className="mr-2 text-[#FFD700]" /> Estado de Mensualidad
            </h5>
            <div className="flex items-center justify-between p-3 bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl">
              <span className="text-[10px] font-bold text-[#10b981] uppercase tracking-widest">Al Día</span>
              <span className="text-xs text-white">Próximo: 05/Jul</span>
            </div>
            <p className="text-[9px] text-gray-500 mt-2">La gestión de pagos se realiza automáticamente. El coach no tiene acceso a esta información.</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h5 className="text-white font-bold mb-4 flex items-center">
              Perfil y Biometría
            </h5>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {atleta.perfil_mental && (
                <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                  Mental: {atleta.perfil_mental}
                </span>
              )}
              {atleta.estado_recuperacion && (
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border ${
                  atleta.estado_recuperacion === 'Óptimo' ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' :
                  atleta.estado_recuperacion === 'Fatiga Silenciosa' ? 'border-orange-500/30 text-orange-400 bg-orange-500/10' :
                  'border-red-500/30 text-red-400 bg-red-500/10'
                }`}>
                  Recuperación: {atleta.estado_recuperacion}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest mb-1">Estatura</p>
                <p className="text-sm font-black text-white">{atleta.talla_cm ? `${atleta.talla_cm} cm` : '—'}</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                <p className="text-[9px] text-green-400 font-bold uppercase tracking-widest mb-1">Peso</p>
                <p className="text-sm font-black text-white">{atleta.peso_kg ? `${atleta.peso_kg} kg` : '—'}</p>
              </div>
              {atleta.modo_vista !== 'formativo' && (
                <>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-purple-400 font-bold uppercase tracking-widest mb-1">IMC</p>
                    <p className="text-sm font-black text-white">{atleta.imc || '—'}</p>
                  </div>
                  <div className="bg-[#FFD700]/10 border border-[#FFD700]/20 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-[#FFD700] font-bold uppercase tracking-widest mb-1">Brazada R.</p>
                    <p className="text-sm font-black text-white">{atleta.brazada_relativa || '—'}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tablón de Notas y Recomendaciones */}
        <div className="md:col-span-2 flex flex-col space-y-4">
          
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {atleta.modo_vista !== 'formativo' ? (
              <>
                <div>
                  <h5 className="text-white font-bold mb-4 flex items-center">
                    <Activity size={16} className="mr-2 text-[#FFD700]" /> Progreso del Mes
                  </h5>
                  
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Este Mes</p>
                      <p className="text-lg font-black text-[#FFD700]">{histogramData.avgActual} <span className="text-[10px] text-gray-500 font-normal">XP</span></p>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Mes Pasado</p>
                      <p className="text-lg font-black text-white">{histogramData.avgAnterior} <span className="text-[10px] text-gray-500 font-normal">XP</span></p>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Histórico</p>
                      <p className="text-lg font-black text-emerald-400">{histogramData.historico} <span className="text-[10px] text-gray-500 font-normal">XP</span></p>
                    </div>
                  </div>

                  {histogramData.data.length > 0 ? (
                    <div className="h-32 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={histogramData.data}>
                          <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px', fontSize: '12px'}} />
                          <Bar dataKey="xp" radius={[4, 4, 0, 0]}>
                            {histogramData.data.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.xp > histogramData.avgAnterior ? '#10b981' : '#f59e0b'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-32 flex items-center justify-center border border-dashed border-white/10 rounded-xl">
                      <p className="text-xs text-gray-500">No hay sesiones este mes</p>
                    </div>
                  )}
                </div>

                <div>
                  <h5 className="text-white font-bold mb-2 flex items-center">
                    <TrendingUp size={16} className="mr-2 text-[#FFD700]" /> Inteligencia de Desarrollo
                  </h5>
                  <p className="text-xs text-gray-400">
                    Basado en las evaluaciones científicas recientes, el motor de Inteligencia sugiere:
                  </p>
                  {getRecomendacion()}
                </div>
              </>
            ) : (
              <div className="md:col-span-2 flex items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-xl">
                <div>
                  <Activity size={32} className="mx-auto mb-4 text-[#FFD700]/50" />
                  <h5 className="text-white font-bold mb-2 uppercase tracking-widest">Enfoque Formativo Activo</h5>
                  <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                    El atleta está actualmente en un programa enfocado en el desarrollo lúdico y la adquisición de hábitos. Las métricas de rendimiento y progresiones analíticas están pausadas para priorizar el disfrute y el aprendizaje natural.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex-1 flex flex-col">
            <h5 className="text-white font-bold mb-4 flex items-center">
              Tablón Oficial de Notas
            </h5>
            
            <div className="flex-1 overflow-y-auto max-h-[200px] pr-2 space-y-3 custom-scrollbar">
              {loading ? (
                <p className="text-xs text-gray-500 italic">Cargando notas...</p>
              ) : notas.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 py-4">
                  <FileText size={24} className="mb-2 opacity-20" />
                  <p className="text-[10px]">No hay notas publicadas aún.</p>
                </div>
              ) : (
                notas.map(nota => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={nota.id} 
                    className="bg-black/40 border border-white/5 rounded-xl p-3"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[9px] text-[#FFD700] uppercase tracking-widest font-bold">Feedback del Coach</span>
                      <span className="text-[8px] text-gray-500 flex items-center">
                        <Calendar size={8} className="mr-1" />
                        {new Date(nota.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{nota.mensaje}</p>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
