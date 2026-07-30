// _shared/credenciales.ts — generación de la contraseña inicial de cualquier
// cuenta nueva.
//
// Vivía incrustada en crear-acceso-usuario y solo la recibían coach y owner
// (v41). Atleta y padre seguían naciendo con `password = cédula` porque el
// onboarding de las ~860 cuentas ya sembradas dependía de eso ("entra con tu
// cédula"). Ese motivo desaparece al arrancar de cero con datos reales, y con
// personas reales el patrón es indefendible: la cédula no es un secreto —está
// en el documento del menor, en la matrícula escolar, en las inscripciones
// federativas y en el grupo de WhatsApp del club—, así que (cédula, cédula)
// es un par de credenciales completo que conoce cualquiera.
//
// Se extrae aquí para que TODAS las vías de alta (registro público y alta por
// panel) usen exactamente la misma regla y no vuelva a haber una excepción por
// rol.

// 14 caracteres de un alfabeto sin ambigüedades visuales (sin O/0, l/1/I):
// estas contraseñas se dictan por teléfono o se copian a mano de un papel, y
// un cero confundido con una O es una llamada al club.
//
// `crypto.getRandomValues` es el CSPRNG del runtime. Se descartan los bytes
// del último tramo incompleto para no introducir sesgo de módulo: sin ese
// filtro los primeros caracteres del alfabeto saldrían con más frecuencia.
export const generarPasswordTemporal = (largo = 14): string => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const limite = Math.floor(256 / abc.length) * abc.length;
  const salida: string[] = [];
  while (salida.length < largo) {
    const bytes = new Uint8Array(largo * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limite) continue;      // sesgo de módulo: se descarta
      salida.push(abc[b % abc.length]);
      if (salida.length === largo) break;
    }
  }
  return salida.join('');
};

// Marca que la cuenta todavía usa la contraseña que le dio el club y debe
// cambiarla. Va en `app_metadata` y NO en `user_metadata` a propósito: el
// propio usuario puede escribir `user_metadata` con `supabase.auth.updateUser`
// desde el navegador, así que ahí la marca se podría borrar sin haber cambiado
// nada. `app_metadata` solo la escribe la Admin API (service_role) y viaja
// firmada en el JWT, de modo que el cliente puede leerla pero no falsificarla.
export const MARCA_PASSWORD_TEMPORAL = { debe_cambiar_password: true };
