import { Dumbbell, ShieldCheck, Users } from 'lucide-react';
import { C, BORDER, cut, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';

/**
 * Separador narrativo para los portales de familia y atleta. No es una pestaña:
 * explica qué viene después dentro del mismo perfil vertical.
 */
export function PortalStoryMarker({ eyebrow, title, description, accent = C.gold }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 10, margin: '28px 0 12px' }}>
      <div aria-hidden="true" style={{ position: 'relative', minHeight: 56 }}>
        <span style={{ position: 'absolute', top: 3, left: 6, width: 7, height: 7, borderRadius: 99, background: accent, boxShadow: `0 0 12px ${accent}` }} />
        <span style={{ position: 'absolute', top: 15, bottom: 0, left: 9, width: 1, background: `linear-gradient(${accent}, transparent)` }} />
      </div>
      <div>
        <MicroLabel color={accent} size={11} tracking=".09em" style={{ marginBottom: 5 }}>{eyebrow}</MicroLabel>
        <h2 style={{ margin: 0, fontSize: 21, lineHeight: 1.05, fontWeight: 900, letterSpacing: '-.035em' }}>{title}</h2>
        {description && <p style={{ margin: '6px 0 0', maxWidth: 560, fontSize: 12.5, lineHeight: 1.55, color: C.text2 }}>{description}</p>}
      </div>
    </div>
  );
}

function TeamFact({ Icon, label, value, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center', background: `${accent}14`, border: `1px solid ${accent}2e`, clipPath: cut(8), color: accent }}>
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <div style={{ minWidth: 0 }}>
        <MicroLabel color={C.text3} size={11} tracking=".05em">{label}</MicroLabel>
        <p style={{ margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 800, color: C.text }}>{value}</p>
      </div>
    </div>
  );
}

/** Hace visible de dónde salen el plan y las mediciones del perfil. */
export function PortalTeamCard({ club, group, coach, activity, accent = C.gold, title = 'Tu equipo te acompaña' }) {
  return (
    <section aria-label={title} style={{ background: 'linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.018))', border: `1px solid ${BORDER.neutral}`, clipPath: cut(14), padding: 15, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div>
          <MicroLabel color={accent} size={11} tracking=".08em">RED DEPORTIVA</MicroLabel>
          <h2 style={{ margin: '4px 0 0', fontSize: 17, lineHeight: 1.1, fontWeight: 900, letterSpacing: '-.025em' }}>{title}</h2>
        </div>
        <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 11, color: C.ok, border: `1px solid ${BORDER.okSoft}`, padding: '6px 8px' }}>CONECTADO</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12 }}>
        <TeamFact Icon={ShieldCheck} label="CLUB" value={club || 'Black Gold'} accent={accent} />
        <TeamFact Icon={Users} label="GRUPO" value={group || 'Por confirmar'} accent={accent} />
        <TeamFact Icon={Dumbbell} label="ACOMPAÑAMIENTO" value={coach || 'Staff del club'} accent={accent} />
      </div>

      <p style={{ margin: '14px 0 0', paddingTop: 12, borderTop: `1px solid ${BORDER.neutral06}`, fontSize: 11.5, lineHeight: 1.5, color: C.text2 }}>
        {activity || 'Las sesiones, misiones y mediciones que registra el staff aparecen aquí.'}
      </p>
    </section>
  );
}
