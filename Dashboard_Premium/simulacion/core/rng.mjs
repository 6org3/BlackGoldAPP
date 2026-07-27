// core/rng.mjs — RNG determinista con semilla.
// Mismo LCG que scripts/simular_club_nuevo_1anio.mjs para que las corridas
// sean reproducibles (misma SEED → mismo resultado). Cambiá SIM_SEED en el
// entorno para explorar universos distintos de forma controlada.

export function crearRng(semillaInicial = Number(process.env.SIM_SEED || 42)) {
  let seed = semillaInicial >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
  const randFloat = (min, max, dec = 1) => {
    const v = rand() * (max - min) + min;
    const f = Math.pow(10, dec);
    return Math.round(v * f) / f;
  };
  const pick = (arr) => arr[randInt(0, arr.length - 1)];
  // true con probabilidad p (0..1)
  const chance = (p) => rand() < p;
  // n elementos distintos de arr (barajado parcial)
  const sample = (arr, n) => {
    const copia = [...arr];
    const out = [];
    for (let i = 0; i < n && copia.length; i++) {
      out.push(copia.splice(randInt(0, copia.length - 1), 1)[0]);
    }
    return out;
  };
  return { rand, randInt, randFloat, pick, chance, sample, get seed() { return seed; } };
}
