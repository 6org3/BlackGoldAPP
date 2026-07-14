import { X, Trophy, Star, Shield, ArrowUpRight, Target, Zap, ChevronRight } from 'lucide-react';
import { getXPProgress } from '../lib/xpProgress';

export default function ProgresoNivelModal({ isOpen, onClose, atleta }) {
  if (!isOpen) return null;

  const xp = atleta?.xp_total || 0;
  const progress = getXPProgress(xp);
  
  const tierInfo = progress.currentRango;
  const tier = tierInfo.nombre;
  let tierColor = tierInfo.color;
  let bgGradient = 'from-gray-500/20 to-gray-900/40';

  if (tierInfo.id === 'rookie') bgGradient = 'from-gray-500/20 to-gray-900/40';
  if (tierInfo.id === 'prospecto') bgGradient = 'from-orange-500/20 to-orange-900/40';
  if (tierInfo.id === 'desarrollo') bgGradient = 'from-blue-500/20 to-blue-900/40';
  if (tierInfo.id === 'elite') bgGradient = 'from-gold-500/20 to-gold-900/40';
  if (tierInfo.id === 'leyenda_mamba') bgGradient = 'from-purple-500/20 to-purple-900/40';

  const niveles = [
    {
      id: 'rookie',
      title: 'Rookie (0 - 999 XP)',
      desc: 'Desarrollo de habilidades motrices básicas y fundamentos técnicos.',
      focus: '80% Físico-Técnico, 20% Táctico-Mental',
      icon: <Star className="w-5 h-5 text-rank-rookie" />
    },
    {
      id: 'prospecto',
      title: 'Prospecto (1,000 - 2,499 XP)',
      desc: 'Transición competitiva. Adaptación al ritmo de juego.',
      focus: '65% Físico-Técnico, 35% Táctico-Mental',
      icon: <ChevronRight className="w-5 h-5 text-rank-prospecto" />
    },
    {
      id: 'desarrollo',
      title: 'Desarrollo (2,500 - 4,999 XP)',
      desc: 'Bases consolidadas. Lectura de juego y toma de decisiones bajo presión.',
      focus: '50% Físico-Técnico, 50% Táctico-Mental',
      icon: <Shield className="w-5 h-5 text-rank-desarrollo" />
    },
    {
      id: 'elite',
      title: 'Élite (5,000 - 7,499 XP)',
      desc: 'Jugadores destacados con gran impacto en el equipo y juego.',
      focus: '35% Físico-Técnico, 65% Táctico-Mental',
      icon: <Star className="w-5 h-5 text-rank-elite" />
    },
    {
      id: 'leyenda_mamba',
      title: 'Leyenda Mamba (7,500+ XP)',
      desc: 'Nivel extra de desafío. Optimización del rendimiento, resiliencia psicológica y liderazgo absoluto.',
      focus: '20% Físico-Técnico, 80% Táctico-Mental',
      icon: <Trophy className="w-5 h-5 text-rank-leyenda" />
    }
  ];

  const ganancias = [
    { tipo: 'Privada 1v1', xp: '+50 XP', desc: 'Máxima intensidad y atención.' },
    { tipo: 'Grupal Individualizada', xp: '+35 XP', desc: 'Máximo 10 atletas. Atención dedicada.' },
    { tipo: 'Grupal (Por Niveles)', xp: '+20 XP', desc: 'Sesión estándar con compañeros de tu nivel.' }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-surface-raised border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl mt-auto mb-auto relative">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 p-2.5 text-fg-secondary hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className={`p-5 sm:p-8 bg-gradient-to-br ${bgGradient} border-b border-white/10 relative overflow-hidden`}>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Trophy className="w-32 h-32" />
          </div>
          
          <div className="relative z-10">
            <h2 className="text-sm font-medium text-fg-secondary uppercase tracking-wider mb-1">Rango Actual</h2>
            <div className="flex items-center gap-3 mb-6">
              <span className={`text-4xl font-black tracking-tight ${tierColor}`}>{tier}</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-fg-secondary">{progress.current.toLocaleString()} XP</span>
                <span className="text-fg-muted">
                  {progress.nextLevelName === 'MAX' 
                    ? 'Nivel Máximo' 
                    : `Siguiente: ${progress.required.toLocaleString()} XP`}
                </span>
              </div>
              <div className="h-3 bg-surface-sunken/50 rounded-full overflow-hidden border border-white/10">
                <div 
                  className={`h-full rounded-full transition duration-1000 bg-gradient-to-r ${tierInfo.bg} to-white/20`}
                  style={{ width: `${Math.min(100, Math.max(0, progress.percentage))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-8">
          {/* Niveles */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-brand" />
              Camino al Élite
            </h3>
            <div className="space-y-3">
              {niveles.map((n) => (
                <div key={n.id} className={`p-4 rounded-xl border ${tierInfo.id === n.id ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/5'}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-1">{n.icon}</div>
                    <div>
                      <h4 className={`font-semibold ${tierInfo.id === n.id ? 'text-brand' : 'text-fg'}`}>
                        {n.title} {tierInfo.id === n.id && '(Tu nivel)'}
                      </h4>
                      <p className="text-sm text-fg-secondary mt-1 leading-relaxed">{n.desc}</p>
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-raised/80 text-xs font-medium text-fg-secondary border border-white/10">
                        Enfoque: {n.focus}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Como ganar XP */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-brand" />
              ¿Cómo sumar Experiencia?
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {ganancias.map((g, idx) => (
                <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center text-center">
                  <span className="text-2xl font-black text-brand mb-2">{g.xp}</span>
                  <span className="text-sm font-semibold text-fg mb-1">{g.tipo}</span>
                  <span className="text-xs text-fg-muted leading-tight">{g.desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-fg-muted text-center flex items-center justify-center gap-2">
              <ArrowUpRight className="w-4 h-4" />
              Las insignias del coach y misiones de la IA otorgan multiplicadores masivos de XP.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
