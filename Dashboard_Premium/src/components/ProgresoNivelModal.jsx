import { Trophy, Star, Shield, ArrowUpRight, Target, Zap, ChevronRight } from 'lucide-react';
import { getXPProgress } from '../lib/xpProgress';
import ModalShell from './arcade/ModalShell';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

export default function ProgresoNivelModal({ isOpen, onClose, atleta }) {
  if (!isOpen) return null;

  const xp = atleta?.xp_total || 0;
  const progress = getXPProgress(xp);

  const tierInfo = progress.currentRango;
  const tier = tierInfo.nombre;
  const tierColor = tierInfo.color;

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
    <ModalShell onClose={onClose} icon={Trophy} eyebrow="Rango actual" title={tier} titleClassName={tierColor} maxWidth="max-w-2xl">
      {/* Progreso de XP */}
      <div className="mb-8">
        <div className="flex justify-between text-sm font-medium mb-2">
          <span style={{ color: C.text2 }}>{progress.current.toLocaleString()} XP</span>
          <span style={{ color: C.text3 }}>
            {progress.nextLevelName === 'MAX' ? 'Nivel Máximo' : `Siguiente: ${progress.required.toLocaleString()} XP`}
          </span>
        </div>
        <div className="h-3 overflow-hidden" style={{ clipPath: cut(4), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` }}>
          <div className="h-full transition-[width] duration-1000" style={{ width: `${Math.min(100, Math.max(0, progress.percentage))}%`, background: GRAD.goldCTA }} />
        </div>
      </div>

      {/* Niveles */}
      <section className="mb-8">
        <h3 className="text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: C.text }}>
          <Target size={16} style={{ color: C.gold }} />
          Camino al Élite
        </h3>
        <div className="space-y-3">
          {niveles.map((n) => {
            const actual = tierInfo.id === n.id;
            return (
              <div key={n.id} className="p-4" style={{ clipPath: cut(8), background: actual ? TINT.gold : 'transparent', border: `1px solid ${actual ? BORDER.goldStrong : BORDER.neutral}` }}>
                <div className="flex items-start gap-3">
                  <div className="mt-1">{n.icon}</div>
                  <div>
                    <h4 className="font-bold" style={{ color: actual ? C.gold : C.text }}>
                      {n.title} {actual && '(Tu nivel)'}
                    </h4>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: C.text2 }}>{n.desc}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium" style={{ clipPath: cut(4), background: C.cardAlt1, color: C.text3, border: `1px solid ${BORDER.neutralSoft}` }}>
                      Enfoque: {n.focus}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cómo ganar XP */}
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: C.text }}>
          <Zap size={16} style={{ color: C.gold }} />
          ¿Cómo sumar Experiencia?
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {ganancias.map((g, idx) => (
            <div key={idx} className="p-4 flex flex-col items-center text-center" style={{ clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.neutral}` }}>
              <span className="text-2xl font-black mb-2" style={{ color: C.gold }}>{g.xp}</span>
              <span className="text-sm font-bold mb-1" style={{ color: C.text }}>{g.tipo}</span>
              <span className="text-xs leading-tight" style={{ color: C.text3 }}>{g.desc}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-center flex items-center justify-center gap-2" style={{ color: C.text3 }}>
          <ArrowUpRight size={16} />
          Las insignias del coach y misiones de la IA otorgan multiplicadores masivos de XP.
        </p>
      </section>
    </ModalShell>
  );
}
