import { describe, it, expect } from 'vitest';
import { resolverContenidoAvatar } from './HexAvatar';

// Solo la decisión de qué se pinta: el entorno de Vitest del repo es `node`,
// sin jsdom, así que el useState que alimenta `fallo` se cubre en Cypress.

describe('resolverContenidoAvatar', () => {
  it('un icono como children gana siempre, aunque llegue un src', () => {
    // Los ~25 call sites de ModalShell/ModalHUD/cabeceras Admin* no son atletas.
    expect(resolverContenidoAvatar({ children: 'icono', src: 'https://x/y.webp' }))
      .toBe('children');
  });

  it('con src y sin fallo pinta la foto por encima de la inicial', () => {
    expect(resolverContenidoAvatar({ src: 'https://x/y.webp', initial: 'J' }))
      .toBe('foto');
  });

  it('si la imagen falló cae a la inicial', () => {
    // Es el caso normal cuando la URL firmada caduca, no una rareza.
    expect(resolverContenidoAvatar({ src: 'https://x/y.webp', fallo: true, initial: 'J' }))
      .toBe('initial');
  });

  it('sin src pinta la inicial, como hasta ahora', () => {
    expect(resolverContenidoAvatar({ initial: 'J' })).toBe('initial');
  });

  it('un src vacío no cuenta como foto', () => {
    expect(resolverContenidoAvatar({ src: '', initial: 'J' })).toBe('initial');
    expect(resolverContenidoAvatar({ src: null, initial: 'J' })).toBe('initial');
  });

  it('sin nada que pintar lo dice explícitamente', () => {
    expect(resolverContenidoAvatar({})).toBe('vacio');
  });
});
