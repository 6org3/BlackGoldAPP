import { C } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import Pill from './Pill';
import RankRow from './RankRow';
import SalidaAdmin from './SalidaAdmin';

/** D4 · Equipo (coaches) — ranking reordenable por asistencia / sesiones / XP. */
export default function PanelEquipo({ ctx }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <MicroLabel as="span" color={C.text3} size={8} tracking=".06em" style={{ marginRight: 2 }}>ORDENAR:</MicroLabel>
        {ctx.sorts.map((so) => (
          <Pill key={so.label} label={so.label} active={so.active} onClick={so.onPick} cut={6} size={8} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {ctx.coaches.map((c, i) => <RankRow key={i} c={c} />)}
      </div>
      {ctx.coaches.length === 0 && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: C.text3, lineHeight: 1.5 }}>
          Aún no hay coaches en el club.
        </p>
      )}
      <p style={{ margin: '0 0 12px', fontSize: 11, color: C.text3, lineHeight: 1.5 }}>Ranking según la métrica elegida · datos últimos 30 días.</p>
      {/* El alta vive fuera del HUD (/admin/equipo): este panel es de lectura. */}
      <SalidaAdmin label={ctx.gestionarLabel} onClick={ctx.onGestionar} />
    </div>
  );
}
