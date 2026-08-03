# Fundación de las sedes reales

Black Gold no es un club: son **cuatro sedes** —Lago Agrio, El Coca, Sacha y
Loreto— y cada una se funda por separado con `fundar_black_gold.mjs`.

Los archivos `*.json` de esta carpeta **están gitignoreados a propósito**: llevan
nombre, cédula, correo y teléfono de personas reales, y este repositorio es
público. Una clave publicada se rota; una cédula publicada, no. Se generan una
vez y se quedan en tu máquina.

## Por qué una sede no puede compartir dueño con otra

No es una decisión de diseño, la impone el esquema:

- `listar_clubes_publicos()` (v33) **solo devuelve clubes con un owner activo**.
  Una sede sin dueño no aparece en el formulario de registro: nadie puede
  inscribirse en ella.
- `usuarios.club` guarda **un solo club por cuenta**, y `cedula`, `correo` y
  `telefono` son **UNIQUE en toda la plataforma** (son identificadores de
  login). La misma persona no puede tener cuatro cuentas de dueño.

De modo que hacen falta **cuatro personas distintas** como dueñas, una por sede.
Quien deba ver las cuatro es el **superadmin de plataforma** (`club: 'Global'`),
que se crea una sola vez: la primera fundación lo da de alta y las tres
siguientes reportan «ya existe» sin tocarlo.

## Datos que hay que rellenar

Por cada archivo, todo lo que empiece por `<REEMPLAZAR` — el script **aborta**
si queda alguno y te dice cuál:

| Bloque | Qué pide |
|---|---|
| `superadmin_plataforma` | Nombre, cédula, correo y teléfono. **El mismo en los 4 archivos.** |
| `owner_original` | El dueño de esa sede. **Distinto en cada archivo.** |
| `owner_secundario` | Opcional (co-dueño). Déjalo con `"activo": false` si no aplica. |
| `cuenta_bancaria` | Texto que ven las familias como instrucciones de pago + WhatsApp del club en formato `593XXXXXXXXX`, sin el `+`. |
| `grupos_entrenamiento` | Nombre, categoría, horario y días. Ojo con `precio_mensual`: si lo dejas en `null`, `generar_pagos_mes` **no factura** a ese grupo. |
| `servicios` | Catálogo de add-ons. Vienen dos de ejemplo, editables o borrables. |

## Cómo se ejecuta

Siempre en seco primero: sin `FUNDAR_REAL=1` el script no escribe nada.

```bash
cd Dashboard_Premium && FUNDAR_CONFIG=scripts/fundacion/lago_agrio.json node scripts/fundar_black_gold.mjs
```

Y cuando el dry-run se vea bien:

```bash
cd Dashboard_Premium && FUNDAR_REAL=1 FUNDAR_CONFIG=scripts/fundacion/lago_agrio.json node scripts/fundar_black_gold.mjs
```

Repetir con `el_coca.json`, `sacha.json` y `loreto.json`.

Cada corrida deja las contraseñas en `scripts/credenciales_black_gold_<sede>.json`
(también gitignoreado). **Se muestran una vez y no se pueden volver a leer**: si
se pierden, la única salida es regenerar el acceso desde el panel.

## Orden respecto a la purga

`purgar_pre_produccion.mjs` borra **las 111 cuentas de Auth, incluida la tuya**.
Entre la purga y la primera fundación no hay nadie que pueda entrar a la app, así
que las dos cosas van seguidas y con los cuatro archivos **ya rellenados**:

1. Rellenar los cuatro `*.json` de esta carpeta.
2. Dry-run de cada uno (cuatro corridas sin `FUNDAR_REAL`).
3. Purgar (`purgar_pre_produccion.mjs`, con su ancla `PURGA_URL`).
4. Fundar las cuatro sedes.
5. Resembrar el club de demostración:
   `SEED_REAL=1 node scripts/sembrar_club_demostracion.mjs`.

El paso 5 recrea **Titanes de Sucumbíos**, que es el único club de prueba que
sobrevive: existe para enseñar la app a terceros y se regenera entero, así que
la purga se lo lleva sin pérdida. Ver [`docs/club_demostracion.md`](../../../docs/club_demostracion.md).
