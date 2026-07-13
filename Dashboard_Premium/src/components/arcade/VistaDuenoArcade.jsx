import { useAuth } from '../../AuthContext';
import { C, GRAD, gridBackground } from './arcadeTokens';
import useDueno from './useDueno';
import { buildDuenoCtx } from './duenoSelectors';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';
import ArcadeBottomNav from './ArcadeBottomNav';
import PanelResumen from './PanelResumen';
import PanelFinanzas from './PanelFinanzas';
import PanelAsistencia from './PanelAsistencia';
import PanelEquipo from './PanelEquipo';
import PanelRetencion from './PanelRetencion';

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
function fechaHoy() {
  const d = new Date();
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · DUEÑO`;
}

/**
 * Panel del DUEÑO en estilo Arcade HUD (rediseño del handoff). Dashboard denso
 * móvil-first: 5 paneles (Resumen · Asistencia · Finanzas · Equipo · Retención)
 * con bottom-nav de hex central ($ = Finanzas). Con `user` owner/superadmin usa
 * datos reales (KPIs/finanzas/asistencia sobre mock); sin ese rol corre en demo
 * con DUENO_MOCK. Molde de shell tomado de VistaPadreArcade.
 */
export default function VistaDuenoArcade() {
  const { user } = useAuth();
  const { state, data, actions, loading } = useDueno(user);
  const ctx = data ? buildDuenoCtx(state, data, actions) : null;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center', background: C.bgApp }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, height: '100dvh', display: 'flex', flexDirection: 'column', color: C.text, ...gridBackground }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 26px', WebkitOverflowScrolling: 'touch' }}>
          {/* Header por panel */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div>
              <MicroLabel color={C.goldDeep} size={9} tracking=".1em" style={{ marginBottom: 6 }}>{fechaHoy()}</MicroLabel>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.05 }}>{ctx ? ctx.panelTitle : 'Black Gold'}</h1>
            </div>
            <HexAvatar size={48} initial="BG" background={GRAD.goldHex} color={C.ink} glow style={{ fontSize: 14, filter: 'drop-shadow(0 0 12px rgba(255,215,0,.4))' }} />
          </div>

          {!ctx || loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <MicroLabel color={C.text3} size={9} tracking=".1em" style={{ animation: 'bg-blink 1.3s infinite' }}>CARGANDO…</MicroLabel>
            </div>
          ) : ctx.isResumen ? (
            <PanelResumen ctx={ctx} />
          ) : ctx.isFinanzas ? (
            <PanelFinanzas ctx={ctx} />
          ) : ctx.isAsistencia ? (
            <PanelAsistencia ctx={ctx} />
          ) : ctx.isEquipo ? (
            <PanelEquipo ctx={ctx} />
          ) : ctx.isRetencion ? (
            <PanelRetencion ctx={ctx} />
          ) : null}
        </div>

        <ArcadeBottomNav variant="dueno" active={ctx ? ctx.navActive : 'resumen'} onNavigate={actions.goTab} />
      </div>
    </div>
  );
}
