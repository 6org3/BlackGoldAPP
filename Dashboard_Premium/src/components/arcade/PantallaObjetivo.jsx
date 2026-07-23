import { C, BORDER, TINT, cut, PIXEL } from './arcadeTokens';
import { labelPilar, labelSubPilar } from '../../../../packages/analytics-core/taxonomia.js';
import { resolveDrills, agruparDrillsPorTipo } from './canchaData';
import CutCard from './CutCard';
import MicroLabel from './MicroLabel';

// Agrupa plantillas por pilar (null → grupo 'Otros'), preservando el orden de
// llegada (ya vienen ordenadas por pilar/título desde fetchPlantillas).
function agruparPorPilar(plantillas) {
  const grupos = new Map();
  plantillas.forEach((p) => {
    const key = p.pilar || null;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(p);
  });
  return [...grupos.entries()];
}

// Lista de nombres de drills de una plantilla, agrupada por tipo (Técnico/Físico/…).
function DrillsResueltos({ ejerciciosIds, ejerciciosMap }) {
  const drills = resolveDrills(ejerciciosIds, ejerciciosMap);
  if (!drills.length) {
    return (
      <p style={{ margin: 0, fontSize: 11, color: C.text3, lineHeight: 1.5 }}>
        {ejerciciosIds.length ? 'Ejercicios no disponibles en el catálogo.' : 'Sin drills asignados.'}
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {agruparDrillsPorTipo(drills).map(([tipo, ds]) => (
        <div key={tipo}>
          <MicroLabel color={C.goldDeep} size={8} tracking=".08em" style={{ marginBottom: 5 }}>{tipo}</MicroLabel>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {ds.map((d, i) => (
              <li key={i} style={{ fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{d.nombre}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function PantallaObjetivo({ state, actions, plantillas = [], ejerciciosMap }) {
  // Catálogo vacío: estado elegante. El footer ("CONTINUAR SIN PLANTILLA") sigue
  // habilitado, así que el coach avanza igual a pasar lista.
  if (!plantillas.length) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '30px 16px',
          background: C.card,
          border: `1px solid ${BORDER.neutral}`,
          clipPath: cut(12),
        }}
      >
        <MicroLabel color={C.text3} size={10} style={{ marginBottom: 8 }}>SIN PLANTILLAS</MicroLabel>
        <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.5 }}>
          Aún no hay plantillas de sesión. Continúa sin plantilla para pasar lista.
        </p>
      </div>
    );
  }

  const grupos = agruparPorPilar(plantillas);

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
        Elige una plantilla para guiar la sesión, o continúa sin plantilla.
      </p>

      {grupos.map(([pilarKey, items]) => (
        <div key={pilarKey || 'otros'} style={{ marginTop: 14 }}>
          <MicroLabel color={C.text3} style={{ marginBottom: 10 }}>
            {pilarKey ? labelPilar(pilarKey) : 'Otros'}
          </MicroLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((p) => {
              const selected = state.plantilla?.id === p.id;
              const count = p.ejerciciosIds.length;
              const chip = p.sub_pilar ? labelSubPilar(p.sub_pilar) : p.enfoque || null;
              // La pantalla resuelve los drills (tiene el ejerciciosMap vivo) y los
              // adjunta a la plantilla que se guarda en el estado — así la sesión
              // arranca con su plan ya resuelto.
              const conDrills = { ...p, drills: resolveDrills(p.ejerciciosIds, ejerciciosMap) };
              return (
                <CutCard
                  key={p.id}
                  cut={12}
                  onClick={() => actions.pickPlantilla(conDrills)}
                  ariaLabel={`${selected ? 'Quitar' : 'Elegir'} plantilla ${p.titulo}`}
                  aria-pressed={selected}
                  background={selected ? 'rgba(255,215,0,.1)' : C.card}
                  border={selected ? BORDER.goldStrong : BORDER.neutral}
                  padding="14px"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '-.02em' }}>{p.titulo}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                        {chip && (
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              color: C.goldDeep,
                              background: TINT.gold,
                              border: `1px solid ${BORDER.gold}`,
                              clipPath: cut(5),
                              padding: '2px 7px',
                              textTransform: 'capitalize',
                            }}
                          >
                            {chip}
                          </span>
                        )}
                        <MicroLabel color={C.text3} size={8.5} tracking="normal">
                          {count > 0 ? `${count} ejercicio${count === 1 ? '' : 's'}` : 'Sin ejercicios'}
                        </MicroLabel>
                      </div>
                    </div>
                    <span style={{ fontFamily: PIXEL, fontSize: 14, color: selected ? C.gold : C.text3, flex: 'none' }}>
                      {selected ? '✓' : '+'}
                    </span>
                  </div>

                  {selected && (
                    <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER.neutral}`, paddingTop: 12 }}>
                      <DrillsResueltos ejerciciosIds={p.ejerciciosIds} ejerciciosMap={ejerciciosMap} />
                    </div>
                  )}
                </CutCard>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
