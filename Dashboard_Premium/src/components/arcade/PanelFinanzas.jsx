import { C, BORDER, cut, HEX, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import Pill from './Pill';
import Donut from './Donut';

function MoneRow({ r }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.card, border: `1px solid ${r.border}`, clipPath: cut(10), padding: '11px 12px' }}>
      <div style={{ width: 34, height: 34, clipPath: HEX, background: r.avatarBg, display: 'grid', placeItems: 'center', color: r.avatarFg, fontWeight: 900, fontSize: 12, flex: 'none' }}>{r.initial}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{r.name}</p>
        <p style={{ margin: '1px 0 0', fontSize: 9.5, color: C.text3 }}>{r.sub}</p>
      </div>
      <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 11, color: r.montoColor || C.text }}>{r.monto}</span>
      <button type="button" onClick={r.onBtn} style={{ flex: 'none', padding: '9px 11px', clipPath: cut(7), background: r.btnBg, border: `1px solid ${r.btnBorder}`, color: r.btnFg, fontFamily: PIXEL, fontSize: 8, letterSpacing: '.03em', cursor: 'pointer' }}>{r.btnLabel}</button>
    </div>
  );
}

/** D2 · Finanzas — filtro por mes, donut de meta, mensualidades/1v1, por
 *  verificar y vencidos/mora. */
export default function PanelFinanzas({ ctx }) {
  const pct = parseInt(ctx.donutPct, 10) || 0;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {ctx.meses.map((m) => (
          <Pill key={m.label} label={m.label} active={m.active} onClick={m.onPick} />
        ))}
      </div>

      {/* Donut de meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: C.card, border: `1px solid ${BORDER.goldMid}`, clipPath: cut(14), padding: 16, marginBottom: 14 }}>
        <Donut pct={pct} color={C.gold} centerTop={ctx.donutPct} centerLabel="DE META" size={122} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <MicroLabel color={C.text3} size={7.5} tracking=".06em">RECAUDADO</MicroLabel>
            <p style={{ margin: '3px 0 0', fontFamily: PIXEL, fontSize: 19, color: C.gold }}>{ctx.recaudadoLabel}</p>
          </div>
          <div>
            <MicroLabel color={C.text3} size={7.5} tracking=".06em">POR COBRAR</MicroLabel>
            <p style={{ margin: '3px 0 0', fontFamily: PIXEL, fontSize: 14, color: C.warn }}>{ctx.porCobrarLabel}</p>
          </div>
          <div>
            <MicroLabel color={C.text3} size={7.5} tracking=".06em">META DEL MES</MicroLabel>
            <p style={{ margin: '3px 0 0', fontFamily: PIXEL, fontSize: 14, color: C.text2 }}>{ctx.metaLabel}</p>
          </div>
        </div>
      </div>

      {/* Barras mensualidades / 1v1 */}
      <div style={{ background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(12), padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
          <MicroLabel color={C.text2} size={8} tracking=".04em">MENSUALIDADES</MicroLabel>
          <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.gold }}>{ctx.menVal}</span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 13 }}>
          {ctx.menCells.map((c, i) => <span key={i} style={{ flex: 1, height: 9, background: c }} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
          <MicroLabel color={C.text2} size={8} tracking=".04em">SESIONES 1V1</MicroLabel>
          <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.cyan }}>{ctx.sesVal}</span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 13 }}>
          {ctx.sesCells.map((c, i) => <span key={i} style={{ flex: 1, height: 9, background: c }} />)}
        </div>
        <div style={{ display: 'flex', gap: 14, paddingTop: 11, borderTop: `1px solid ${BORDER.neutral06}` }}>
          <span style={{ fontFamily: PIXEL, fontSize: 8.5, color: C.danger }}>{ctx.vencidosLabel}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 8.5, color: C.info }}>{ctx.becadosLabel}</span>
        </div>
      </div>

      {/* Por verificar */}
      <MicroLabel color={C.gold} size={9.5} style={{ margin: '0 0 8px' }}>POR VERIFICAR · {ctx.verificarCount}</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {ctx.verificar.map((r, i) => <MoneRow key={i} r={r} />)}
        {ctx.verificar.length === 0 && <p style={{ margin: 0, fontSize: 11, color: C.text3 }}>Nada por verificar.</p>}
      </div>

      {/* Vencidos / mora */}
      <MicroLabel color={C.danger} size={9.5} style={{ margin: '0 0 8px' }}>VENCIDOS · MORA</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ctx.vencidos.map((r, i) => <MoneRow key={i} r={{ ...r, montoColor: C.danger }} />)}
      </div>
    </div>
  );
}
