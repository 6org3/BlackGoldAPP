import { describe, it, expect } from 'vitest';
import { fichaFisica } from './padreData';

describe('fichaFisica', () => {
  it('deriva IMC y brazada relativa de la fila de atletas', () => {
    const f = fichaFisica({ peso_kg: 58.4, talla_cm: 168, envergadura_cm: 172 });
    expect(f.peso).toBe(58.4);
    expect(f.talla).toBe(168);
    expect(f.imc).toBe(20.7); // 58.4 / 1.68² = 20.69…
    expect(f.brazada).toBe(4);
  });

  it('sin peso ni talla devuelve null (estado vacío en la UI)', () => {
    expect(fichaFisica({})).toBeNull();
    expect(fichaFisica(null)).toBeNull();
    expect(fichaFisica({ peso_kg: null, talla_cm: undefined })).toBeNull();
  });

  it('con un solo dato no inventa derivados', () => {
    const soloPeso = fichaFisica({ peso_kg: 40 });
    expect(soloPeso.peso).toBe(40);
    expect(soloPeso.imc).toBeNull();
    expect(soloPeso.brazada).toBeNull();

    const soloTalla = fichaFisica({ talla_cm: 150 });
    expect(soloTalla.talla).toBe(150);
    expect(soloTalla.imc).toBeNull();
  });

  it('ignora valores no numéricos o ≤ 0 (datos sucios de importaciones)', () => {
    expect(fichaFisica({ peso_kg: 'abc', talla_cm: 0 })).toBeNull();
    const f = fichaFisica({ peso_kg: '32.5', talla_cm: '141' });
    expect(f.peso).toBe(32.5); // strings numéricas de la DB se aceptan
    expect(f.imc).toBe(16.3);
  });

  it('brazada negativa conserva el signo', () => {
    const f = fichaFisica({ peso_kg: 50, talla_cm: 160, envergadura_cm: 155 });
    expect(f.brazada).toBe(-5);
  });
});
