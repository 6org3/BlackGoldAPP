import { C, BORDER, PIXEL, cut } from './arcadeTokens';
import MicroLabel from './MicroLabel';

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Ficha física (peso · talla · IMC · brazada) para los portales de atleta y
 * padre. Recibe el objeto de `fichaFisica()` (padreData) o null → estado
 * vacío honesto, sin datos inventados. El IMC se muestra sin etiqueta
 * clínica a propósito: en menores se interpreta por percentiles de edad y
 * sexo, y clasificarlo aquí induciría a error — lo contextualiza el coach.
 */
export default function FichaFisica({ fisico, accent = C.gold, emptyText = 'Aún sin medición — pídesela a tu coach.' }) {
  const items = fisico
    ? [
        fisico.peso != null && { label: 'PESO', val: fmt(fisico.peso), unidad: 'kg' },
        fisico.talla != null && { label: 'TALLA', val: fmt(fisico.talla), unidad: 'cm' },
        fisico.imc != null && { label: 'IMC', val: fisico.imc.toFixed(1), unidad: 'kg/m²' },
        fisico.brazada != null && { label: 'BRAZADA', val: `${fisico.brazada > 0 ? '+' : ''}${fmt(fisico.brazada)}`, unidad: 'cm' },
      ].filter(Boolean)
    : [];

  return (
    <div style={{ background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(12), padding: '12px 14px', marginBottom: 14 }}>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>{emptyText}</p>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          {items.map((it) => (
            <div key={it.label} style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER.neutralFaint}`, clipPath: cut(7), padding: '9px 4px 8px' }}>
              <MicroLabel color={C.text3} size={7.5} tracking=".08em" as="span" style={{ display: 'block' }}>
                {it.label}
              </MicroLabel>
              <p style={{ margin: '4px 0 0', fontFamily: PIXEL, fontSize: 13, color: accent }}>{it.val}</p>
              <p style={{ margin: '2px 0 0', fontSize: 8.5, color: C.text4 }}>{it.unidad}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
