import { C, cut, HEX, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import Donut from './Donut';
import AltasBajasTable from './AltasBajasTable';

/** D5 · Retención — gauge 90 días, altas/bajas por mes y atletas en riesgo de baja. */
export default function PanelRetencion({ ctx }) {
  const pct = parseInt(ctx.retPct, 10) || 0;
  return (
    <div>
      {/* Gauge de retención */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: C.card, border: '1px solid rgba(52,211,153,.25)', clipPath: cut(14), padding: 16, marginBottom: 14 }}>
        <Donut pct={pct} color={C.ok} centerTop={ctx.retPct} centerLabel="90 DÍAS" size={112} />
        <div style={{ flex: 1 }}>
          <MicroLabel color={C.text3} size={7.5} tracking=".06em">RETENCIÓN DEL CLUB</MicroLabel>
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: C.text }}>{ctx.activosLine}</p>
          <MicroLabel color={C.ok} size={9} tracking="normal" style={{ marginTop: 8 }}>{ctx.netoLine}</MicroLabel>
        </div>
      </div>

      <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }}>ALTAS / BAJAS · POR MES</MicroLabel>
      <div style={{ marginBottom: 18 }}>
        <AltasBajasTable rows={ctx.ab} />
      </div>

      <MicroLabel color={C.warn} size={9.5} style={{ margin: '0 0 8px' }}>EN RIESGO DE BAJA · {ctx.riesgoCount}</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ctx.riesgo.map((r) => (
          <div key={r.rowKey} style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.card, border: `1px solid ${r.border}`, clipPath: cut(10), padding: '11px 12px' }}>
            <div style={{ width: 34, height: 34, clipPath: HEX, background: r.avatarBg, display: 'grid', placeItems: 'center', color: r.avatarFg, fontWeight: 900, fontSize: 12, flex: 'none' }}>{r.initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{r.name}</p>
              {/* aria-live: anuncia a lector de pantalla el cambio a "Dado de baja del club". */}
              <p style={{ margin: '1px 0 0', fontSize: 9.5, color: r.motivoColor }} aria-live="polite">{r.motivo}</p>
            </div>
            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {r.showContactar && (
                <button type="button" onClick={r.onBtn} aria-label={`Contactar a ${r.name}`} style={{ padding: '8px 11px', clipPath: cut(7), background: r.btnBg, border: `1px solid ${r.btnBorder}`, color: r.btnFg, fontFamily: PIXEL, fontSize: 8, letterSpacing: '.03em', cursor: 'pointer' }}>{r.btnLabel}</button>
              )}
              {r.bajaButtons.map((b) => (
                <button key={b.key} type="button" onClick={b.onClick} aria-label={b.ariaLabel} style={{ padding: '8px 11px', clipPath: cut(7), background: b.bg, border: `1px solid ${b.border}`, color: b.fg, fontFamily: PIXEL, fontSize: 8, letterSpacing: '.03em', cursor: 'pointer' }}>{b.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
