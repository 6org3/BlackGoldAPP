import { PIXEL, C, cut } from './arcadeTokens';

/** Tabla densa de altas/bajas por mes (dueño · retención): mini-celdas verdes
 *  (altas) / rojas (bajas) + neto coloreado. */
export default function AltasBajasTable({ rows = [] }) {
  return (
    <div style={{ background: C.card, border: '1px solid rgba(255,255,255,.08)', clipPath: cut(12), padding: '6px 14px 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '38px 1fr 1fr 58px', gap: 10, alignItems: 'center', padding: '8px 0 6px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <span />
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: C.ok, letterSpacing: '.06em' }}>ALTAS</span>
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: C.danger, letterSpacing: '.06em' }}>BAJAS</span>
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: C.text3, letterSpacing: '.06em', textAlign: 'right' }}>NETO</span>
      </div>
      {rows.map((ab, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '38px 1fr 1fr 58px', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: C.text3 }}>{ab.m}</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {ab.aCells.map((c, j) => (
              <span key={j} style={{ width: 11, height: 14, background: c, clipPath: cut(3) }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {ab.bCells.map((c, j) => (
              <span key={j} style={{ width: 11, height: 14, background: c, clipPath: cut(3) }} />
            ))}
          </div>
          <span style={{ textAlign: 'right', fontFamily: PIXEL, fontSize: 9, color: ab.netoColor }}>{ab.neto}</span>
        </div>
      ))}
    </div>
  );
}
