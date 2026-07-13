// Lógica de la acción destructiva "dar de baja" del panel Retención (D5) del
// dueño. Verifica el view-model puro buildDuenoCtx → ctxRetencion: los botones
// por estado (reposo → armada → dada), el cableado a las acciones y las
// invariantes de seguridad (existe siempre una salida no destructiva).
import { describe, it, expect } from 'vitest';
import { buildDuenoCtx } from './duenoSelectors';

const RIESGO = [{ id: 'nayeli', initial: 'N', hue: 'red', name: 'Nayeli Ríos', motivo: 'Fatiga', mc: '#F87171' }];

function makeData() {
  return {
    demo: false,
    retencion: { retPct: 90, activosLine: '47 de 48', netoLine: '+1 NETO', ab: [], riesgo: RIESGO },
  };
}

function makeActions() {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  const actions = {
    goTab: rec('goTab'), armBaja: rec('armBaja'), cancelBaja: rec('cancelBaja'),
    darBaja: rec('darBaja'), reactivar: rec('reactivar'), contactar: rec('contactar'),
  };
  return { actions, calls };
}

const baseState = { dTab: 'retencion', dContactados: {}, dBajas: {}, dBajaArmar: null };
const fila = (state, actions) => buildDuenoCtx(state, makeData(), actions).riesgo[0];

describe('ctxRetencion · acción dar de baja', () => {
  it('reposo: un único botón "DAR DE BAJA" que arma la confirmación; CONTACTAR visible', () => {
    const { actions, calls } = makeActions();
    const r = fila(baseState, actions);
    expect(r.rowKey).toBe('nayeli'); // key estable (no índice)
    expect(r.showContactar).toBe(true);
    expect(r.bajaButtons).toHaveLength(1);
    expect(r.bajaButtons[0].label).toBe('DAR DE BAJA');
    r.bajaButtons[0].onClick();
    expect(calls).toEqual([['armBaja', 'nayeli']]);
  });

  it('armada: DOS botones (CANCELAR / ¿CONFIRMAR?); CONTACTAR oculto; hay salida no destructiva', () => {
    const { actions, calls } = makeActions();
    const r = fila({ ...baseState, dBajaArmar: 'nayeli' }, actions);
    expect(r.showContactar).toBe(false);
    expect(r.bajaButtons.map((b) => b.key)).toEqual(['cancel', 'confirm']);
    // Invariante de seguridad: existe un objetivo táctil que NO ejecuta la baja.
    const cancelar = r.bajaButtons.find((b) => b.key === 'cancel');
    const confirmar = r.bajaButtons.find((b) => b.key === 'confirm');
    expect(cancelar.label).toBe('CANCELAR');
    cancelar.onClick();
    expect(calls).toEqual([['cancelBaja']]); // cancelar NO da de baja
    confirmar.onClick();
    expect(calls).toContainEqual(['darBaja', 'nayeli']);
  });

  it('dada: un botón "↩ DESHACER" que reactiva; motivo actualizado; CONTACTAR oculto', () => {
    const { actions, calls } = makeActions();
    const r = fila({ ...baseState, dBajas: { nayeli: true } }, actions);
    expect(r.showContactar).toBe(false);
    expect(r.motivo).toBe('Dado de baja del club');
    expect(r.bajaButtons).toHaveLength(1);
    expect(r.bajaButtons[0].label).toContain('DESHACER');
    r.bajaButtons[0].onClick();
    expect(calls).toEqual([['reactivar', 'nayeli']]); // reversible desde la UI
  });

  it('todos los botones exponen aria-label descriptivo con el nombre del atleta', () => {
    const { actions } = makeActions();
    for (const st of [baseState, { ...baseState, dBajaArmar: 'nayeli' }, { ...baseState, dBajas: { nayeli: true } }]) {
      for (const b of fila(st, actions).bajaButtons) {
        expect(b.ariaLabel).toMatch(/Nayeli Ríos/);
      }
    }
  });
});
