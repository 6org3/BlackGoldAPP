import { describe, it, expect, vi, beforeEach } from 'vitest';

// El servicio importa el cliente real de Supabase (que exige env vars) y el
// pipeline de canvas: los dos se mockean para poder probar en `node` lo único
// delicado de esta capa — el agrupado de firmas y la caché.

const createSignedUrls = vi.fn();
const remove = vi.fn(async () => ({ data: null, error: null }));
const upload = vi.fn(async () => ({ error: null }));
const rpc = vi.fn(async () => ({ data: { path_anterior: null }, error: null }));

vi.mock('./supabaseClient', () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrls, remove, upload, list: async () => ({ data: [], error: null }) }) },
    rpc: (...args) => rpc(...args),
  },
}));

vi.mock('../lib/imagenPerfil', () => ({
  prepararImagen: async () => ({ blob: { type: 'image/webp', size: 1234 }, ext: 'webp' }),
}));

const { getFotosUrls, getFotoUrl, invalidarFotoUrl, limpiarCacheFotos, subirFotoAtleta } =
  await import('./fotosAtletasService');

const okPara = (paths) =>
  paths.map((p) => ({ path: p, signedUrl: `https://cdn/${p}?token=abc`, error: null }));

beforeEach(() => {
  limpiarCacheFotos();
  createSignedUrls.mockReset();
  rpc.mockClear();
  remove.mockClear();
  createSignedUrls.mockImplementation(async (paths) => ({ data: okPara(paths), error: null }));
});

describe('agrupado de firmas', () => {
  it('firma en UNA sola petición todo lo pedido en el mismo tick', async () => {
    // Es el caso de /admin/atletas: 100 tarjetas montan 100 avatares a la vez.
    const paths = Array.from({ length: 100 }, (_, i) => `atleta-${i}/foto.webp`);
    const resultados = await Promise.all(paths.map((p) => getFotoUrl(p)));

    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][0]).toHaveLength(100);
    expect(resultados[0]).toBe('https://cdn/atleta-0/foto.webp?token=abc');
  });

  it('trocea en lotes de 100 cuando se piden más', async () => {
    const paths = Array.from({ length: 250 }, (_, i) => `atleta-${i}/foto.webp`);
    await getFotosUrls(paths);

    expect(createSignedUrls).toHaveBeenCalledTimes(3);
    const tamanos = createSignedUrls.mock.calls.map((c) => c[0].length).sort((a, b) => b - a);
    expect(tamanos).toEqual([100, 100, 50]);
  });

  it('no vuelve a firmar lo que ya está en caché', async () => {
    await getFotoUrl('a-1/foto.webp');
    await getFotoUrl('a-1/foto.webp');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it('vuelve a firmar tras invalidar (el onError del <img>)', async () => {
    await getFotoUrl('a-1/foto.webp');
    invalidarFotoUrl('a-1/foto.webp');
    await getFotoUrl('a-1/foto.webp');
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it('no llama a la API con una lista vacía', async () => {
    expect(await getFotosUrls([])).toEqual(new Map());
    expect(await getFotosUrls([null, undefined, ''])).toEqual(new Map());
    expect(await getFotoUrl(null)).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('deduplica el mismo path repetido', async () => {
    await getFotosUrls(['a-1/f.webp', 'a-1/f.webp', 'a-2/f.webp']);
    expect(createSignedUrls.mock.calls[0][0]).toHaveLength(2);
  });
});

describe('errores por ítem', () => {
  it('un path que falla no tumba al resto del lote', async () => {
    createSignedUrls.mockImplementation(async (paths) => ({
      data: paths.map((p) => (p.startsWith('roto')
        ? { path: p, signedUrl: null, error: 'Object not found' }
        : { path: p, signedUrl: `https://cdn/${p}`, error: null })),
      error: null,
    }));

    const urls = await getFotosUrls(['roto/x.webp', 'bien/y.webp']);
    expect(urls.get('roto/x.webp')).toBeNull();
    expect(urls.get('bien/y.webp')).toBe('https://cdn/bien/y.webp');
  });

  it('mapea por índice cuando la respuesta no trae path', async () => {
    // El tipo declara `path: string | null` en los ítems fallidos.
    createSignedUrls.mockImplementation(async (paths) => ({
      data: paths.map(() => ({ path: null, signedUrl: null, error: 'x' })),
      error: null,
    }));
    const urls = await getFotosUrls(['a-1/f.webp']);
    expect(urls.get('a-1/f.webp')).toBeNull();
  });

  it('un fallo global no reintenta en cada llamada (negative caching)', async () => {
    createSignedUrls.mockImplementation(async () => ({ data: null, error: new Error('red') }));
    await getFotoUrl('a-1/f.webp');
    await getFotoUrl('a-1/f.webp');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });
});

describe('limpiarCacheFotos', () => {
  it('obliga a re-firmar: son URLs vivas a rostros de menores', async () => {
    await getFotoUrl('a-1/f.webp');
    limpiarCacheFotos();
    await getFotoUrl('a-1/f.webp');
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });
});

describe('subirFotoAtleta', () => {
  it('sube, registra la fila y devuelve un path bajo la carpeta del atleta', async () => {
    const { path } = await subirFotoAtleta('11111111-1111-1111-1111-111111111111', {});

    // La forma la exige el CHECK de v53 y la política de INSERT de v53b.
    expect(path).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,64}$/
    );
    expect(rpc).toHaveBeenCalledWith('establecer_foto_atleta', {
      p_atleta_id: '11111111-1111-1111-1111-111111111111',
      p_path: path,
    });
  });

  it('borra el objeto recién subido si la RPC rechaza (sin huérfanos)', async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: new Error('sin permiso') }));
    await expect(subirFotoAtleta('11111111-1111-1111-1111-111111111111', {})).rejects.toThrow(/permiso/);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('borra la foto anterior cuando se reemplaza', async () => {
    rpc.mockImplementationOnce(async () => ({
      data: { path_anterior: 'a-1/vieja.webp' }, error: null,
    }));
    await subirFotoAtleta('11111111-1111-1111-1111-111111111111', {});
    expect(remove).toHaveBeenCalledWith(['a-1/vieja.webp']);
  });

  it('exige un atleta', async () => {
    await expect(subirFotoAtleta(null, {})).rejects.toThrow(/Falta el atleta/);
  });
});
