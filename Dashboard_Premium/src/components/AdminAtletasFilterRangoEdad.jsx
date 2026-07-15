import { useId } from 'react';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';
import { parseEdad } from '../lib/edad';

// Gemelo de FilterSelect para un rango numérico: mismo label, mismo corte y el
// mismo oro cuando el extremo acota. Cada extremo es independiente — acotar
// solo el mínimo ("de 14 en adelante") es un caso normal, no un rango a medias.
export default function FilterRangoEdad({ edadMin, edadMax, onChangeMin, onChangeMax }) {
  const labelId = useId();

  const campoStyle = (activo) => ({
    clipPath: cut(5),
    background: activo ? TINT.gold : 'transparent',
    border: `1px solid ${activo ? BORDER.goldStrong : BORDER.neutralSoft}`,
    color: activo ? C.gold : C.text,
  });

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-[11px] font-bold uppercase tracking-widest" style={{ color: C.text2 }}>
        Edad
      </span>
      <div className="flex items-center gap-2">
        <input
          type="number" inputMode="numeric" min="0" max="99"
          placeholder="Mín"
          aria-label="Edad mínima"
          value={edadMin ?? ''}
          onChange={(e) => onChangeMin(parseEdad(e.target.value))}
          className="cut-focus arcade-input w-20 px-3 py-2.5 min-h-11 text-[11px] font-bold tracking-widest focus:outline-none"
          style={campoStyle(edadMin !== undefined)}
        />
        <span aria-hidden="true" className="text-[11px] font-bold" style={{ color: C.text3 }}>a</span>
        <input
          type="number" inputMode="numeric" min="0" max="99"
          placeholder="Máx"
          aria-label="Edad máxima"
          value={edadMax ?? ''}
          onChange={(e) => onChangeMax(parseEdad(e.target.value))}
          className="cut-focus arcade-input w-20 px-3 py-2.5 min-h-11 text-[11px] font-bold tracking-widest focus:outline-none"
          style={campoStyle(edadMax !== undefined)}
        />
        <span className="text-[11px]" style={{ color: C.text3 }}>años</span>
      </div>
    </div>
  );
}
