// Lógica de control de abuso del registro público (hallazgo P1-6, 2026-07-29).
// El módulo vive en supabase/functions/_shared/ porque lo consume una Edge
// Function (Deno), pero estas piezas son puras y se prueban aquí: son las que
// deciden a quién se frena, y equivocarse en ellas significa o dejar pasar el
// alta masiva o bloquear a una familia real.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ipDeRequest,
  leerLimite,
  verificarCaptcha,
  LIMITE_IP_HORA_DEFAULT,
  LIMITE_CLUB_DIA_DEFAULT,
} from '../../supabase/functions/_shared/controlAbuso.ts';

const conDeno = (vars) => {
  globalThis.Deno = { env: { get: (k) => vars[k] } };
};

afterEach(() => {
  delete globalThis.Deno;
  vi.unstubAllGlobals();
});

describe('ipDeRequest', () => {
  it('prefiere cf-connecting-ip, que el borde escribe y el cliente no puede falsificar', () => {
    const h = new Headers({
      'cf-connecting-ip': '200.0.0.9',
      'x-real-ip': '10.0.0.1',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    });
    expect(ipDeRequest(h)).toBe('200.0.0.9');
  });

  it('usa x-real-ip cuando no hay cabecera de Cloudflare', () => {
    expect(ipDeRequest(new Headers({ 'x-real-ip': '190.5.5.5', 'x-forwarded-for': '1.2.3.4' }))).toBe('190.5.5.5');
  });

  it('de x-forwarded-for toma el ÚLTIMO salto, no el primero', () => {
    // El primero es justo el que un atacante puede inventar para rotar de
    // identidad en cada request; el último lo escribió el proxy de confianza.
    expect(ipDeRequest(new Headers({ 'x-forwarded-for': '1.2.3.4, 190.7.7.7' }))).toBe('190.7.7.7');
  });

  it('con un solo valor en x-forwarded-for devuelve ese', () => {
    expect(ipDeRequest(new Headers({ 'x-forwarded-for': '190.7.7.7' }))).toBe('190.7.7.7');
  });

  it('sin ninguna cabecera agrupa todo bajo un mismo cubo en vez de dejar la vía sin contador', () => {
    expect(ipDeRequest(new Headers())).toBe('desconocida');
  });
});

describe('leerLimite', () => {
  it('cae al default cuando la variable no está puesta', () => {
    conDeno({});
    expect(leerLimite('REGISTRO_LIMITE_IP_HORA', LIMITE_IP_HORA_DEFAULT)).toBe(5);
    expect(leerLimite('REGISTRO_LIMITE_CLUB_DIA', LIMITE_CLUB_DIA_DEFAULT)).toBe(20);
  });

  it('respeta un valor válido del entorno', () => {
    conDeno({ REGISTRO_LIMITE_IP_HORA: '12' });
    expect(leerLimite('REGISTRO_LIMITE_IP_HORA', LIMITE_IP_HORA_DEFAULT)).toBe(12);
  });

  it('ignora basura, cero y negativos: un límite 0 dejaría el registro caído', () => {
    for (const v of ['0', '-3', 'abc', '']) {
      conDeno({ REGISTRO_LIMITE_IP_HORA: v });
      expect(leerLimite('REGISTRO_LIMITE_IP_HORA', LIMITE_IP_HORA_DEFAULT)).toBe(5);
    }
  });
});

describe('verificarCaptcha', () => {
  it('sin secreto configurado deja pasar: el captcha es opcional, los límites no', async () => {
    expect(await verificarCaptcha(null, '1.1.1.1', undefined)).toEqual({ ok: true });
  });

  it('con secreto pero sin token rechaza', async () => {
    const r = await verificarCaptcha(null, '1.1.1.1', 'secreto');
    expect(r.ok).toBe(false);
  });

  it('acepta cuando siteverify responde success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: true }) })));
    expect(await verificarCaptcha('tok', '1.1.1.1', 'secreto')).toEqual({ ok: true });
  });

  it('manda el secreto en el cuerpo, nunca en la URL', async () => {
    const fetchSpy = vi.fn(async () => ({ json: async () => ({ success: true }) }));
    vi.stubGlobal('fetch', fetchSpy);
    await verificarCaptcha('tok', '1.1.1.1', 'secreto');

    const [url, opciones] = fetchSpy.mock.calls[0];
    expect(url).not.toContain('secreto');
    expect(opciones.body.get('secret')).toBe('secreto');
    expect(opciones.body.get('response')).toBe('tok');
    expect(opciones.body.get('remoteip')).toBe('1.1.1.1');
  });

  it('no manda remoteip cuando la IP no se pudo resolver', async () => {
    const fetchSpy = vi.fn(async () => ({ json: async () => ({ success: true }) }));
    vi.stubGlobal('fetch', fetchSpy);
    await verificarCaptcha('tok', 'desconocida', 'secreto');
    expect(fetchSpy.mock.calls[0][1].body.get('remoteip')).toBeNull();
  });

  it('rechaza cuando siteverify dice que no', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) })));
    const r = await verificarCaptcha('tok', '1.1.1.1', 'secreto');
    expect(r.ok).toBe(false);
  });

  it('si el verificador no responde FRENA (fail-closed): si no, tumbar ese dominio desactivaría el captcha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red caída'); }));
    const r = await verificarCaptcha('tok', '1.1.1.1', 'secreto');
    expect(r.ok).toBe(false);
  });
});
