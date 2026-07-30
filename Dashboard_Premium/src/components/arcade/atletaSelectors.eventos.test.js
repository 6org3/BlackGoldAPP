// comp-02: ctxEventos calculaba el contador "X/Y VAN" con un +1 optimista
// asimétrico. Sumaba cuando el atleta CONFIRMABA (voy && !e.going) pero nunca
// restaba cuando RETIRABA una confirmación previa (e.going && !voy) — el
// contador quedaba inflado hasta el próximo fetch. Matriz de los 4 casos
// going/voy × 2.
import { describe, it, expect } from 'vitest';
import { buildAtletaCtx } from './atletaSelectors';

const actions = { voyToggle: () => {} };

const eventoCtx = (evento, aVoy) => {
  const state = { aTab: 'eventos', aVoy };
  const data = { eventos: [evento] };
  return buildAtletaCtx(state, data, actions).eventos[0];
};

describe('ctxEventos · confLabel "X/Y VAN"', () => {
  it('going=false, voy=false (sin tocar) → sin ajuste optimista', () => {
    const ctx = eventoCtx({ id: 'e1', conf: 10, tot: 20, going: false }, {});
    expect(ctx.confLabel).toBe('10/20 VAN');
  });

  it('going=false, voy=true (confirma ahora) → +1 optimista', () => {
    const ctx = eventoCtx({ id: 'e1', conf: 10, tot: 20, going: false }, { e1: true });
    expect(ctx.confLabel).toBe('11/20 VAN');
  });

  it('going=true, voy=true (ya confirmado, sin tocar) → sin ajuste', () => {
    const ctx = eventoCtx({ id: 'e1', conf: 10, tot: 20, going: true }, {});
    expect(ctx.confLabel).toBe('10/20 VAN');
  });

  it('going=true, voy=false (retira la confirmación) → -1 optimista (antes quedaba inflado)', () => {
    const ctx = eventoCtx({ id: 'e1', conf: 10, tot: 20, going: true }, { e1: false });
    expect(ctx.confLabel).toBe('9/20 VAN');
  });
});
