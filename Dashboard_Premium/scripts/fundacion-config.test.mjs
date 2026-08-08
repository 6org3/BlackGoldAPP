import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  resolverRutaConfigFundacion,
  validarConfigFundacionReal,
} from "./fundacion-config.mjs";

const plantilla = "/repo/scripts/fundacion_black_gold.config.json";
const privada = "/repo/scripts/fundacion_black_gold.config.local.json";

test("prefiere la configuración local ignorada cuando existe", () => {
  assert.equal(
    resolverRutaConfigFundacion({ plantilla, privada, existe: (ruta) => ruta === privada }),
    privada,
  );
});

test("usa la plantilla solo para dry-run cuando no hay configuración privada", () => {
  const ruta = resolverRutaConfigFundacion({ plantilla, privada, existe: () => false });
  assert.equal(ruta, plantilla);
  assert.doesNotThrow(() => validarConfigFundacionReal({ real: false, ruta, plantilla }));
  assert.throws(
    () => validarConfigFundacionReal({ real: true, ruta, plantilla }),
    /configuración local/i,
  );
});

test("una ruta explícita permite un archivo privado fuera del repositorio", () => {
  const ruta = resolverRutaConfigFundacion({
    plantilla,
    privada,
    rutaExplicita: "/secrets/black-gold-lago-agrio.json",
    existe: () => true,
  });
  assert.equal(ruta, path.resolve("/secrets/black-gold-lago-agrio.json"));
  assert.doesNotThrow(() => validarConfigFundacionReal({ real: true, ruta, plantilla }));
});
