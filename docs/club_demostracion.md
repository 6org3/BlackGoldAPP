# Club de demostración

Club ficticio y completo para mostrarle la app a un tercero, con una cuenta
logueable por rol. Se siembra con
[`Dashboard_Premium/scripts/sembrar_club_demostracion.mjs`](../Dashboard_Premium/scripts/sembrar_club_demostracion.mjs)
y se comprueba con
[`verificar_club_demostracion.mjs`](../Dashboard_Premium/scripts/verificar_club_demostracion.mjs).

**Titanes de Sucumbíos** — 24 atletas en 3 grupos, 1 dueño, 2 entrenadoras/es,
10 representantes, medio año de evaluaciones, 4 semanas de sesiones y asistencia,
misiones con XP, encuestas de bienestar, cobros de 4 meses, un evento convocado y
un comunicado.

## Cómo entrar

Las credenciales quedan en `Dashboard_Premium/scripts/credenciales_club_demo.json`
al correr el seed. **Ese archivo no se versiona** (`.gitignore`:
`**/credenciales*.json`) y no puede versionarse: este repositorio es público y son
credenciales vivas contra el proyecto Supabase real.

El campo de usuario acepta **cédula, correo o teléfono**: cualquiera de los tres.
Para dictar por teléfono, la cédula es lo más corto.

| Rol | Usuario | Persona |
|---|---|---|
| Dueño | `2199000001` | Ricardo Salazar Vinueza |
| Entrenadora | `2199000011` | Elena Chamorro Ruiz (ve todo el club) |
| Atleta | `2199000101` | Antonella Morán Grefa (Sub-13) |
| Representante | `0999770001` | Gabriela Grefa Andi (dos hijos en el club) |

Hay una tercera cuenta de staff **sin acceso**, Iván Beltrán Ocaña, limitada a
Menores (Sub-14): sirve para explicar que un entrenador no ve el club entero.

Las contraseñas se **reescriben en cada corrida** del seed, así que el archivo
siempre dice la verdad. Si hace falta fijarlas, se pasan por variable de entorno
(`DEMO_PASS_OWNER`, `DEMO_PASS_COACH`, `DEMO_PASS_ATLETA`, `DEMO_PASS_PADRE`).

## Qué se puede mostrar en cada portal

Verificado en la app, no supuesto.

**Dueño** (`/club`) — recaudado del mes contra la meta, asistencia media del
club, atletas activos, cuántos están en riesgo, alertas que piden acción (pagos
vencidos, con el monto en mora), finanzas mes a mes, equipo y retención.

**Entrenadora** (`/coach`) — la sesión de hoy con su grupo y su objetivo;
"atletas a mirar hoy" con seis casos reales de fatiga silenciosa, agotamiento
activo y alerta de hidratación; el foco de desarrollo señalando a cada atleta su
sub-pilar más flojo; el plantel con rangos; comparación por categoría.

**Atleta** (`/atleta`) — racha, PWR, barra de XP hacia el siguiente rango, el
check-in de bienestar del día con su lectura, la misión destacada, el próximo
evento con la asistencia confirmada, los 8 pilares con relieve (fortalezas y
flaquezas distintas por atleta), insignias y el XP de las últimas 6 semanas.

**Representante** (`/padre`) — sus dos hijos, el evento con la asistencia ya
confirmada, la mensualidad del mes con el **descuento del 10% por hermanos**
aplicado, el historial de los meses pagados, la misión que su hija tiene en
revisión y las últimas sesiones a las que asistió.

## Resembrar

```bash
cd Dashboard_Premium && SEED_REAL=1 node scripts/sembrar_club_demostracion.mjs
```

Sin `SEED_REAL=1` hace una pasada en seco y no escribe nada. Es idempotente:
volver a correrlo no duplica, solo completa lo que falte y vuelve a fijar las
contraseñas.

Cuando se cambia **cómo** se generan los datos, la idempotencia juega en contra
(protege lo ya escrito, así que el generador nuevo no se nota). Para eso:

```bash
cd Dashboard_Premium && SEED_REAL=1 DEMO_REHACER=evaluaciones,bienestar,misiones,sesiones node scripts/sembrar_club_demostracion.mjs
```

`DEMO_REHACER` borra esas secciones **solo de este club** (resuelve los atletas
desde `usuarios.club`, así que no puede alcanzar a otro) y las vuelve a sembrar.

Después, siempre:

```bash
cd Dashboard_Premium && node scripts/verificar_club_demostracion.mjs
```

Comprueba 25 cosas, y no solo que las filas existan: que el radar tenga relieve,
que las marcas mejoren entre baterías, que alguien levante bandera **hoy** (la
señal exige respuesta del día), que haya sesión programada para hoy si algún
grupo entrena hoy, que los pagos estén en varios estados, y que las cuatro
cuentas **entren de verdad** — resolviendo el identificador y comprobando el
vínculo `usuarios.auth_user_id`, no solo que Auth acepte la contraseña.

## Tres diferencias deliberadas con el producto real

Una demostración no es un alta, así que el seed se salta a propósito tres cosas
que en el producto son obligatorias:

1. **La contraseña no es irrecuperable.** En el producto la genera el servidor,
   se muestra una vez y no se guarda; aquí la genera el seed en un formato
   dictable (`Palabra-Palabra-1234`, 18 caracteres) y la deja en el archivo local.
2. **No se marca `debe_cambiar_password`.** Si se marcara, quien entre se topa
   con la pantalla de cambio obligatorio en mitad de la demostración.
3. **Las contraseñas se reescriben en cada corrida**, para que el archivo de
   credenciales nunca miente.

## Detalles del club, por si alguien pregunta

- Las **cédulas empiezan por `2199`** y no pueden colisionar con una real: en
  Ecuador el tercer dígito de una cédula de persona natural es menor que 6, así
  que ningún `21·9·…` existe. A la vista parecen cédulas, que es lo que hace
  falta en una demostración.
- Los correos usan el dominio inexistente `titanesdemo.ec`, así que ningún correo
  del club puede aterrizar en el buzón de una persona real. Los atletas menores
  **no llevan correo propio** (v57): su cuenta vive en el sintético
  `<cédula>@sinacceso.blackgoldapp.internal` y el club contacta al representante.
- Los nombres de grupo van prefijados con "Titanes" porque
  `grupos_entrenamiento.nombre` es **único en toda la plataforma**, no por club.
- El plantel se genera con semilla fija: dos corridas dan el mismo club, y los
  nombres no bailan entre demostraciones.
- Un reset de la base borra este club como cualquier otro. Se recupera corriendo
  el seed otra vez.
