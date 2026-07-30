# Formulario de alta — clubes y staff

Plantilla de captura para dar de alta un club y a las personas que lo dirigen.
Los campos son **exactamente** los que pide la app en `/admin/equipo` (alta de
coaches y co-dueños) y en la configuración de cobros del club, así que lo que se
recoja aquí se teclea sin traducir nada.

Sirve para el arranque con los clubes reales y para cada persona que entre
después. Rellenar una **Ficha de club** por club y una **Ficha de persona** por
cada adulto.

---

## Antes de recolectar: lo que la app no perdona

Tres campos son **identificadores de login**, no datos de contacto. Los tres son
únicos en toda la plataforma, y de los tres se puede iniciar sesión (cédula,
correo o teléfono, indistintamente).

| Campo | Único | Qué pasa si se repite |
|---|---|---|
| **Cédula** | Sí, global | El alta falla. Es el usuario con el que esa persona entra. |
| **Correo** | Sí, global | El alta falla. **Dos personas que ambas necesitan entrar no pueden compartir correo** — es el límite de Auth y no tiene arreglo técnico. |
| **Teléfono** | Sí, global | El alta falla. Un número por persona, aunque en casa se comparta. |

Consecuencias prácticas al recolectar:

- **Marido y mujer que dirigen el mismo club necesitan un correo cada uno.** Si
  solo tienen uno, uno de los dos no podrá tener cuenta.
- **El correo es la única vía de recuperación** cuando se active el envío de
  correos. Sin correo, si esa persona pierde su contraseña, el dueño (o el
  superadmin) tiene que regenerársela a mano. Por eso aquí va como obligatorio
  aunque la pantalla lo acepte vacío.
- **La contraseña NO se recolecta.** La genera el servidor al crear el acceso,
  se muestra una sola vez y no se guarda en ningún sitio. Hay que anotarla en
  ese momento y entregarla a la persona, que estará obligada a cambiarla en su
  primer ingreso.
- Un **dueño ve y evalúa todo su club**, así que si el dueño también entrena
  **no hace falta darlo de alta dos veces**. Basta con la ficha de dueño.

---

## Ficha de club

Una por club. El nombre es lo primero que hay que fijar: queda escrito en cada
fila de cada persona y de cada atleta, así que cambiarlo después es una
migración, no una edición.

```
NOMBRE DEL CLUB (exacto, con tildes y mayúsculas como debe verse):
  ______________________________________________

Ciudad: ______________________________________

WhatsApp del club (el número al que escriben los padres): ______________

Día de vencimiento de la cuota mensual (1 a 28):  ______   [por defecto: 5]

Descuento por hermanos (%):  ______   [por defecto: 0 · usar 10 si hay]

Datos de transferencia, tal como los verá el padre en su pantalla:
  ______________________________________________
  ______________________________________________
```

### Grupos de entrenamiento del club

Un grupo es un horario con un precio. Un atleta puede estar en varios, pero
solo uno le factura la mensualidad (el **básico**); los demás se cobran como
añadidos.

> **Ojo:** el nombre del grupo es único **en toda la plataforma**, no por club.
> Dos clubes no pueden tener los dos un grupo llamado "Sub-12". Conviene
> prefijarlo con algo del club ("Aguarico Sub-12").

| Nombre del grupo | Días | Hora inicio | Hora fin | Precio mensual | Precio sesión individual |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

---

## Ficha de persona

Una por cada adulto. Copiar el bloque tantas veces como haga falta.

```
CLUB: ________________________________________

1. Nombre y apellidos completos:
   ______________________________________________

2. Cédula (10 dígitos — es el usuario con el que inicia sesión):
   __________

3. ¿Qué es en el club?   [ ] Dueño     [ ] Co-dueño     [ ] Entrenador

4. Correo (único, personal, el que usa de verdad):
   ______________________________________________

5. Teléfono / WhatsApp (único, 10 dígitos, formato 09XXXXXXXX):
   __________

6. Si es entrenador — ¿a qué categoría dirige?
   [ ] Todas (ve el club entero)
   [ ] Premini (Sub-9)      [ ] Mini (Sub-11)       [ ] Menores (Sub-14)
   [ ] Prejuvenil (Sub-16)  [ ] Juvenil (Sub-18)    [ ] Mayores

7. Si es dueño — ¿además entrena a algún grupo?   [ ] Sí   [ ] No
   (Si es Sí, no hace falta ficha aparte: un dueño ya ve y evalúa a todos.)
```

**Sobre el punto 3:** en cada club hay **un** dueño principal — el que instala
el superadmin y el único que puede invitar co-dueños. Los demás adultos son
co-dueños (mismos permisos que el dueño) o entrenadores (solo su categoría).

**Sobre el punto 6:** la categoría no es una etiqueta, es un permiso. Un
entrenador de "Menores (Sub-14)" **no ve** a los atletas de las otras
categorías. En un club pequeño donde todos entrenan a todos, la respuesta
correcta es "Todas".

---

## Tabla consolidada

A medida que se van llenando las fichas, pasarlas aquí. Esta tabla es lo que se
carga en el sistema.

| # | Club | Nombre completo | Cédula | Rol | Correo | Teléfono | Categoría |
|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |  |
| 9 |  |  |  |  |  |  |  |

Antes de cargar, revisar tres cosas sobre la tabla completa:

1. **Ninguna cédula repetida.**
2. **Ningún correo repetido.**
3. **Ningún teléfono repetido.**

Cualquiera de las tres colisiones para el alta con un error, y el orden de carga
importa: primero el dueño de cada club, después su equipo.

---

## Mensaje para pedirle los datos a cada persona

Copiable tal cual por WhatsApp. No pide la contraseña (no existe todavía) ni
ningún dato que no haga falta.

```
Hola [nombre]. Estamos montando el sistema del club y necesito estos
datos para crear tu cuenta:

1. Nombre y apellidos completos
2. Número de cédula
3. Un correo personal (será tu usuario y por ahí recuperas la
   contraseña si se te olvida — tiene que ser tuyo, no compartido)
4. Tu número de WhatsApp

Cuando la cuenta esté lista te paso tu contraseña. Es temporal: la app
te va a pedir que la cambies por una tuya la primera vez que entres.
```

---

## Lo que aún falta decidir (no es un campo del formulario)

- **La encuesta de bienestar (sueño, fatiga) no tiene interruptor.** El módulo
  está siempre disponible; lo que se decide es si se le pide al atleta que la
  conteste a diario. No hay nada que configurar para arrancar sin ella.
- El correo del representante **no es obligatorio** cuando el staff da de alta a
  un atleta desde el panel, aunque sí lo es en el registro público. Una familia
  cargada sin correo se queda sin vía de recuperación propia.
