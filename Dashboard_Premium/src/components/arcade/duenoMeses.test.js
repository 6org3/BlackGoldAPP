// Etiquetas de mes del panel Finanzas (D2) del dueño. El bucket de finanzas usa
// claves relativas (m0 = mes en curso, m1 = anterior, m2 = el previo) y las
// etiquetas se derivan de la fecha real. Antes eran literales may/jun/jul: los
// datos sí avanzaban con el calendario pero el rótulo no, así que a partir de
// agosto el dueño leía "JULIO" sobre la recaudación de agosto.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDuenoCtx } from './duenoSelectors';
import { DUENO_MOCK } from './duenoMock';

const MESES_UP = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const bucket = (recaudado) => ({
  recaudado, meta: 3000, cobrar: 0, men: 0, ses: 0, vencCount: 0, vencMonto: 0, becados: 0,
});

function makeData(mesesMeta) {
  return {
    demo: false,
    finanzas: { m0: bucket(300), m1: bucket(200), m2: bucket(100) },
    mesesMeta,
    verificar: [],
    vencidos: [],
  };
}

const actions = { goTab: () => {}, goHref: () => {}, pickMes: () => {}, salir: () => {} };

afterEach(() => vi.useRealTimers());

describe('ctxFinanzas · etiquetas de mes', () => {
  it('rotula cada bucket con el mes que le corresponde, no con un literal fijo', () => {
    const meses = [{ k: 'm2', label: 'OCT' }, { k: 'm1', label: 'NOV' }, { k: 'm0', label: 'DIC' }];
    const ctx = buildDuenoCtx({ dTab: 'finanzas', dMes: 'm0' }, makeData(meses), actions);
    expect(ctx.meses.map((m) => m.label)).toEqual(['OCT', 'NOV', 'DIC']);
  });

  it('marca activo el mes seleccionado y arranca en el mes en curso', () => {
    const meses = [{ k: 'm2', label: 'OCT' }, { k: 'm1', label: 'NOV' }, { k: 'm0', label: 'DIC' }];
    const data = makeData(meses);
    const actual = buildDuenoCtx({ dTab: 'finanzas' }, data, actions);
    expect(actual.meses.find((m) => m.active).label).toBe('DIC');

    const previo = buildDuenoCtx({ dTab: 'finanzas', dMes: 'm2' }, data, actions);
    expect(previo.meses.find((m) => m.active).label).toBe('OCT');
    // Y el mes elegido manda sobre los datos mostrados, no solo sobre el rótulo.
    expect(previo.recaudadoLabel).toBe('$100');
  });

  it('cruza el fin de año sin repetir ni saltarse un mes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 15)); // enero 2027
    expect(DUENO_MOCK.mesesMeta.map((m) => m.label)).toEqual(['NOV', 'DIC', 'ENE']);
  });

  it('no desborda el mes cuando hoy es día 31 (setMonth sobre un mes corto)', () => {
    vi.useFakeTimers();
    // 31 de julio: restar un mes sin anclar al día 1 daría "31 de junio" → 1 de
    // julio, y el panel mostraría julio dos veces.
    vi.setSystemTime(new Date(2026, 6, 31));
    expect(DUENO_MOCK.mesesMeta.map((m) => m.label)).toEqual(['MAY', 'JUN', 'JUL']);
  });

  it('las claves son relativas, nunca nombres de mes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    expect(DUENO_MOCK.mesesMeta.map((m) => m.k)).toEqual(['m2', 'm1', 'm0']);
    expect(Object.keys(DUENO_MOCK.finanzas).sort()).toEqual(['m0', 'm1', 'm2']);
    // Blindaje del bug original: ninguna clave puede ser un mes del calendario.
    const nombres = MESES_UP.map((m) => m.toLowerCase());
    Object.keys(DUENO_MOCK.finanzas).forEach((k) => expect(nombres).not.toContain(k));
  });
});
