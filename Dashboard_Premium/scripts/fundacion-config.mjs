import path from "node:path";

export function resolverRutaConfigFundacion({ plantilla, privada, rutaExplicita = process.env.FUNDACION_CONFIG_PATH, existe }) {
  if (typeof rutaExplicita === "string" && rutaExplicita.trim()) return path.resolve(rutaExplicita.trim());
  return existe(privada) ? privada : plantilla;
}

export function validarConfigFundacionReal({ real, ruta, plantilla }) {
  if (real && path.resolve(ruta) === path.resolve(plantilla)) {
    throw new Error(
      "FUNDAR_REAL=1 exige una configuración local: copia fundacion_black_gold.config.json "
      + "a fundacion_black_gold.config.local.json y completa los datos reales.",
    );
  }
}
