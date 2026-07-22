# Black Gold — Arcade HUD (lenguaje visual)

**"El oro se gana — y se muestra como un marcador."** Este documento es la **fuente de verdad** del lenguaje visual Arcade HUD: la capa de expresión que Black Gold usa hoy en los portales de Atleta, Padre, Dueño y en Modo Cancha, y que el equipo decidió converger a **toda** la app (falta migrar staff/admin/sistema/coach clásico y el legacy Tier C).

El `arcadeTokens.js` referencia un handoff `Screen.dc.html + README` que **no existe en el repositorio**. Ese prototipo no es recuperable; por lo tanto **este documento reemplaza esa referencia** como origen normativo. Al tocar un valor del HUD, contrástalo contra este documento, no contra el handoff fantasma.

- **Implementación JS (única fuente de tokens del HUD):** `Dashboard_Premium/src/components/arcade/arcadeTokens.js` — paleta `C`, `BORDER`, `GRAD`, `cut()`/`HEX`/`CELL`, `GLOW`, `gridBackground`, `hueFg`/`hueBg`, `PIXEL`, `fmtClock`.
- **Implementación CSS:** sección "ARCADE HUD" de `Dashboard_Premium/src/styles/tokens.css` — token `--font-pixel` (Silkscreen) y los keyframes globales `bg-blink`/`bg-pop`/`bg-rise`/`bg-cursor`/`bg-glow-pulse`, más `.arcade-input`.
- **Primitivas:** `Dashboard_Premium/src/components/arcade/*.jsx` (15 componentes de sistema).
- **Pantallas de referencia:** `VistaAtletaArcade.jsx`, `ModoCanchaArcade.jsx`, `VistaDuenoArcade.jsx`.

### Relación con el Design System v1

El Arcade HUD **no es un sistema paralelo**: es una **capa de expresión encima del DS v1** (`docs/design_system.md`). Hereda su filosofía ("el oro se gana"), su paleta base (los hex del Arcade son los mismos tokens de superficie/oro/semánticos del DS, transcritos a JS), sus reglas de gobernanza (nada de hex arbitrarios en pantallas, un solo oro por vista, `prefers-reduced-motion`, nunca `transition-all`) y su compromiso de accesibilidad. Lo que el Arcade **añade** es una gramática formal propia: retícula de videojuego, formas con esquina cortada, hexágonos, tipografía pixel (Silkscreen) para números y micro-labels, y un marco de teléfono como lienzo. Donde este documento no dice lo contrario, **rige el DS v1**.

---

## 1. Filosofía: "HUD de un videojuego de club"

Si el DS v1 es "el túnel de vestuarios de un club de élite de noche", el Arcade HUD es **el marcador de arcade sobre ese túnel**: la misma oscuridad premium, pero leída como la pantalla de un juego deportivo retro-futurista donde el progreso del atleta se muestra como XP, rangos, insignias y celdas que se llenan.

1. **Móvil-first, marco de teléfono.** Todo el lenguaje nació dentro de un lienzo vertical de `maxWidth: 480` y `height: 100dvh`. La composición asume una columna, scroll interno, bottom-nav fija y CTA persistente al pie. Escalarlo a desktop y a data densa es trabajo explícito (§8), no una consecuencia automática.
2. **El oro se gana.** Igual que en DS v1: oro sólido = máximo un elemento por vista (el CTA, el hex central de la nav, el logro desbloqueado). El resto es oro translúcido, texto dorado o retícula tenue. Si todo brilla, nada brilla.
3. **La forma comunica jerarquía.** El hexágono es identidad (avatares, insignias, botón central). La esquina cortada (`cut`) es superficie de contenido. Nunca al revés: no se cortan avatares ni se hexagonan tarjetas.
4. **La retícula es el campo de juego.** Un fondo de líneas doradas a 36px con un halo radial superior encuadra cada pantalla como el tablero de un HUD. Es ambiente, nunca contenido.
5. **Pixel para el marcador, legible para el resto.** Silkscreen (`--font-pixel`) se reserva a números grandes y micro-labels en MAYÚSCULA (el "marcador"). El cuerpo, los nombres y las descripciones siguen en Outfit (`--font-sans`) para no sacrificar lectura.
6. **El movimiento celebra el logro.** Parpadeos de "en vivo", rebotes al desbloquear, filas que suben en el reparto de XP. La UI diaria es discreta; la gamificación es donde el HUD se enciende.

---

## 2. Tokens

Todos los valores de esta sección son los **reales** de `arcadeTokens.js`. Las pantallas los consumen vía `import { … } from './arcadeTokens'` y estilos inline; **no escriben color arbitrario** (§9).

### 2.1 Paleta (`C`)

**Fondos** — el negro es el escenario; hay dos negros de lienzo casi idénticos (app y marco de teléfono) y tres superficies de tarjeta:

| Token | Valor | Uso |
|---|---|---|
| `C.bgApp` | `#050506` | Fondo detrás del marco de teléfono (letterbox en desktop) |
| `C.bgPhone` | `#050507` | Lienzo del marco (base de `gridBackground`) |
| `C.card` | `rgba(13,13,16,.92)` | **Superficie base del HUD** (toda `CutCard`, KPI, fila) |
| `C.cardAlt1` | `#0D0D0F` | Pozo/variante sólida |
| `C.cardAlt2` | `#13131A` | Variante elevada |

**Oro** — la recompensa (equivale a `gold-300/500/600` del DS v1):

| Token | Valor | Uso |
|---|---|---|
| `C.goldLight` | `#FFEB66` | Highlight/brillo (extremo claro de gradientes, vértice seleccionado del radar) |
| `C.gold` | `#FFD700` | **Oro canónico** — el único que "vende" |
| `C.goldDeep` | `#D4AF37` | Oro metálico: extremo oscuro de gradientes, micro-labels de fecha/paso |

**Texto** (mismos que `fg*` del DS v1) — `C.text #EDEDED` · `C.text2 #9CA3AF` · `C.text3 #828997` · `C.text4 #4B5563` (solo decorativo) · `C.ink #0A0A0C` (texto sobre oro) · `C.inkGreen #04110B` (texto sobre verde sólido) · `C.onDanger #FFFFFF` (texto sobre danger sólido).

> **`C.text3` es muted-ACCESIBLE (2026-07-13, Ola 0).** Subido de `#6B7280` a `#828997` para que los micro-labels (que usan `C.text3` por defecto, §2.1) pasen **AA 4.5:1** en toda superficie del HUD — antes medían ~4.0:1. Es el escalón muted del HUD, más tenue que `C.text2`; la jerarquía del "marcador" la marcan el **tamaño** y la **fuente pixel**, no la penumbra ilegible. Sincronizado con `--color-fg-muted` (DS v1). Cualquier micro-label sigue siendo `C.text3` — no volver a `#6B7280`.

**Semánticos** — cada uno con par base (fondos/dots/barras) y "deep" (sólido fuerte):

| Significado | base | deep |
|---|---|---|
| Éxito / presente / pagado | `C.ok #34D399` | `C.okDeep #10B981` |
| Fatiga / pendiente (ámbar) | `C.warn #FB923C` | `C.warnDeep #F59E0B` |
| Crítico / ausente / deuda | `C.danger #F87171` | `C.dangerDeep #EF4444` |
| Físico / info (azul) | `C.info #60A5FA` | `C.infoDeep #3B82F6` |
| Misiones / mental (púrpura, "IA") | `C.ai #C084FC` | `C.aiDeep #A855F7` |
| Rango "desarrollo" completado (cian) | `C.cyan #22D3EE` | — |
| Botón de reporte WhatsApp | `C.whatsapp #25D366` | — |

### 2.2 Bordes (`BORDER`)

El idioma de bordes son **blancos y oros alfa**. Neutros: `neutral rgba(255,255,255,.08)` (por defecto) · `neutralSoft .1` · `neutralFaint .05` · `neutral06 .06`. Oro: `gold rgba(255,215,0,.14)` · `gold16 .16` · `goldMid .22` · `goldStrong .4`. Semánticos: `ok rgba(16,185,129,.4)` · `okSoft/okStrong` (verde) · `danger rgba(239,68,68,.3)` · `info rgba(96,165,250,.35)` · `ai rgba(168,85,247,.3)` · `warn rgba(251,146,60,.35)`. **Regla:** el borde comunica estado; no inventar un rgba, elegir uno de `BORDER`.

### 2.3 Gradientes (`GRAD`)

| Token | Valor | Uso |
|---|---|---|
| `goldCTA` | `linear-gradient(135deg,#FFEB66,#FFD700 45%,#D4AF37)` | CTA dorado (footer "Guardar/Finalizar") |
| `goldCTA150` | `linear-gradient(150deg,#FFEB66,#FFD700 45%,#D4AF37)` | **Botón hex central de la nav** |
| `greenCTA` | `linear-gradient(135deg,#34D399,#10B981)` | CTA de confirmación (iniciar sesión, guardar evaluación) |
| `goldText` | `linear-gradient(135deg,#FFEB66,#D4AF37)` | Relleno de celdas XP, mini-fills |
| `goldHex` | `linear-gradient(150deg,#FFEB66,#D4AF37)` | Hexágonos dorados (avatar dueño, insignia desbloqueada, rango actual) |
| `heroGoldTile` | `linear-gradient(150deg, rgba(255,215,0,.12), rgba(13,13,16,.95))` | Tile héroe teñido de oro |
| `infoAvatar` | `linear-gradient(150deg,#60A5FA,#3B82F6)` | Avatar hex del padre (azul info) |
| `heroGold` / `heroGoldSoft` | oro→carta (150deg) | Paneles héroe dorados |
| `activeGreen` / `activeGreenSoft` | verde→carta (150deg) | Paneles de estado activo |
| `heroInfo` | azul→carta (150deg) | Panel héroe azul |

### 2.4 Formas firma (clip-path)

Son la gramática geométrica del HUD. Tres funciones/constantes en `arcadeTokens.js`:

- **`cut(n)` — esquina cortada.** Recorta la esquina **superior-derecha** y la **inferior-izquierda** en `n` px:
  ```
  polygon(0 0, calc(100% - N px) 0, 100% N px, 100% 100%, N px 100%, 0 calc(100% - N px))
  ```
  Es la superficie de **contenido** del HUD (toda tarjeta, KPI, fila, chip, botón CTA). Escala de corte por rol: `cut(14)` grandes, `cut(12)` tarjetas/paneles, `cut(10)` KPI/CutCard por defecto, `cut(8)` sub-tarjetas, `cut(7)` chips/pills y botones-icono, `cut(5)` celdas de heatmap, `cut(2)` barras de XP semanal.
- **`HEX` — hexágono.** `polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)` (vértice arriba y abajo, lados planos). Es la forma de **identidad**: avatares (`HexAvatar`), insignias (`Badge`), nodos de rango, botón central de la nav. Tamaños canónicos del prototipo: 34 / 44 / 54 / 66 / 76 px.
- **`CELL` = `cut(3)` — mini-corte.** El chaflán de 3px de las celdas de XP (`XPCells`), para que la barra segmentada se lea como fichas y no como bloques.

**Regla dura:** `HEX` solo para identidad, `cut` solo para contenido. No mezclar.

### 2.5 Glows y sombras (`GLOW`)

| Token | Valor | Uso |
|---|---|---|
| `hexGold` | `drop-shadow(0 0 12px rgba(255,215,0,.4))` | Halo de avatar/hex dorado |
| `hexGoldStrong` | `0 0 20px rgba(255,215,0,.55)` | Insignia desbloqueada |
| `timer` | `0 0 22px rgba(16,185,129,.5)` | Cronómetro de sesión activa |
| `star` | `0 0 8px rgba(255,215,0,.5)` | Estrella encendida (`StarRating`) |
| `trophy` | `0 0 34px rgba(255,215,0,.5)` | Trofeo de cierre de clase |
| `phone` | `0 34px 70px -22px rgba(0,0,0,.9), 0 0 40px -18px rgba(255,215,0,.35)` | Elevación del marco de teléfono |
| `minBar` | `0 -8px 26px rgba(0,0,0,.6)` | Minibar flotante de sesión |

El glow **siempre acompaña al oro o a un estado**; nunca es decoración libre. Sin oro/estado, sin glow.

### 2.6 Retícula de fondo (`gridBackground`)

El "campo de juego". Objeto de estilo que se aplica al contenedor del marco:

```js
backgroundColor: C.bgPhone,
backgroundImage:
  'linear-gradient(rgba(255,215,0,.028) 1px, transparent 1px),' +   // líneas horizontales
  'linear-gradient(90deg, rgba(255,215,0,.028) 1px, transparent 1px),' + // verticales
  'radial-gradient(900px 480px at 50% -8%, rgba(255,215,0,.07), transparent 60%)', // halo superior
backgroundSize: '36px 36px, 36px 36px, 100% 100%',
```

Retícula dorada casi imperceptible (`.028` de alfa) a **36px** + un halo radial dorado que "ilumina" la parte superior de la pantalla. Es ambiente puro: nunca lleva contenido ni interacción encima que dependa de la línea.

### 2.7 Tipografía

Dos familias con contrato estricto:

- **Silkscreen (pixel) — `PIXEL` = `var(--font-pixel, 'Silkscreen', monospace)`**, con `--font-pixel: 'Silkscreen','Outfit',ui-monospace,monospace`. **Solo** para: (a) números grandes del marcador (XP, KPI, cronómetro, porcentaje del donut, valor del rango) y (b) micro-labels en MAYÚSCULA (`MicroLabel`: "EN CURSO", "PWR", "MIS 7 PILARES"). Tamaños observados: 6.5–8px (micro-labels y etiquetas de eje), 9–12px (labels de sección, chips), 13–21px (números del marcador; KPI a 21, cronómetro a 15, donut a 17).
- **Outfit (`--font-sans`)** — todo el cuerpo: nombres de atleta, descripciones, textos de alerta, tips. Pesos 700/800/900 para títulos y nombres; el resto en el rango del DS v1.

Jerarquía típica de una pantalla del HUD:

| Rol | Receta (inline) | Ejemplo |
|---|---|---|
| Título de panel | `fontSize: 24–26, fontWeight: 900, letterSpacing: -.03/-.04em` (Outfit) | "Progreso", "Black Gold" |
| Título de flujo | `fontSize: 17, fontWeight: 900, letterSpacing: -.03em` (Outfit) | "Pasar lista" |
| Número marcador | `fontFamily: PIXEL, fontSize: 15–21` | `2.450`, `48:12` |
| Micro-label (eyebrow) | `MicroLabel` — PIXEL 7–9.5px, tracking `.06–.12em`, uppercase | "EN CURSO", "PASO 2 · ASISTENCIA" |
| Cuerpo | `fontSize: 12–13, fontWeight: 700` (Outfit) | Texto de alerta, nombre en fila |
| Nota | `fontSize: 10–10.5` (Outfit), `C.text2/3` | Subtexto de KPI |

> **Tensión con el piso legible del DS v1.** El DS v1 fija un mínimo de **9px** para cualquier texto. El HUD baja a 6.5–8px en micro-labels y etiquetas de eje **porque Silkscreen a ese tamaño mantiene su rejilla de píxeles legible donde Outfit no lo haría** — es una excepción deliberada del pixel-art, no licencia para texto pequeño en Outfit. Regla: por debajo de 9px, **solo Silkscreen en MAYÚSCULA y solo para labels/números cortos**, nunca cuerpo. En la extensión desktop (§8) este piso vuelve a 9px porque desaparece la coartada del marco de 480px.

### 2.8 Hue del atleta (`hueFg` / `hueBg`)

Color por estado/perfil del atleta, usado en avatares y dots de riesgo. `hueFg(hue)` da el color de primer plano, `hueBg(hue)` el fondo translúcido (`.2` de alfa):

| `hue` | fg | bg |
|---|---|---|
| `green` | `#34D399` | `rgba(52,211,153,.2)` |
| `gold` | `#FFD700` | `rgba(255,215,0,.2)` |
| `red` | `#F87171` | `rgba(239,68,68,.2)` |
| `blue` | `#60A5FA` | `rgba(96,165,250,.2)` |
| `orange` | `#FB923C` | `rgba(249,115,22,.2)` |

Fallback: `C.text2` sobre `rgba(255,255,255,.1)`.

### 2.9 Helper de reloj

`fmtClock(segundos)` → `"MM:SS"` (con relleno de ceros, clamp a 0). Es el formato canónico del cronómetro de sesión (`ModoCanchaArcade`, minibar).

---

## 3. Inventario de primitivas

15 componentes en `Dashboard_Premium/src/components/arcade/`. Las pantallas **componen con estas + `arcadeTokens`**; no reconstruyen sus estructuras a mano.

| Componente | Propósito | Props clave | Cuándo usar |
|---|---|---|---|
| **`CutCard`** | Superficie base con esquina cortada; se vuelve control accesible con `onClick` (rol button, foco, teclado) sin cambiar aspecto | `cut=10`, `background`, `border`, `padding`, `onClick`, `ariaLabel` | Todo contenedor de contenido del HUD |
| **`HexAvatar`** | Avatar/badge hexagonal con inicial o icono, coloreado por `hue` o directo | `initial`/`children`, `size=44`, `hue`, `background`, `color`, `glow`, `onClick` | Identidad de persona/club |
| **`Badge`** | Insignia hexagonal que se desbloquea (gris desaturado → hex dorado con glow y `bg-pop`) | `icon`, `name` (admite `\n`), `unlocked` | Logros por eje del atleta |
| **`Pill`** | Chip de filtro/segmento genérico (activo = oro suave + borde dorado) | `label`, `active`, `onClick`, `accent=C.gold`, `cut=7`, `size=8.5` | Filtros reutilizables (misiones/finanzas) |
| **`SegmentToggle`** | Toggle P/A de asistencia (Presente=verde, Ausente=rojo, sin marcar=neutro); área táctil ≥44px | `value` (`'P'`/`'A'`/undefined), `onPresent`, `onAbsent`, `name` | Pasar lista |
| **`MicroLabel`** | Etiqueta pixel en MAYÚSCULA — la micro-tipografía del HUD | `size=9.5`, `color=C.text3`, `tracking='0.1em'`, `as='p'` | Eyebrows, labels de sección/paso |
| **`KpiTile`** | Celda KPI (micro-label + número Silkscreen semántico + subtexto) sobre `cut(10)` | `label`, `val`, `color=C.gold`, `sub`, `border` | Grid 2×2 de KPIs del dueño |
| **`Donut`** | Anillo de progreso SVG (r=58, stroke 14); texto central en `<div>` superpuesto (no `<text>` SVG) | `pct`, `color=C.gold`, `centerTop`, `centerLabel`, `size=122` | Meta financiera (oro), retención (verde) |
| **`Heatmap`** | Heatmap de ocupación (grid `44px + 6 días`), celdas táctiles con alpha por %, leyenda LIBRE→LLENO; data-driven | `days`, `rows` (celdas ya calculadas por selector) | Ocupación semanal del dueño |
| **`RadarChart`** | Radar táctil de **N pilares** — geometría derivada de `axes.length` (los 8 sub-pilares del radar hoy; viewBox 260×215, centro 130,112, radio 82); resalta vértice `selectedKey`, llama `onSelect(key)` | `axes` `[{key,label,value 0..100}]`, `selectedKey`, `onSelect`, `accent`, `fill` | Perfil de pilares del atleta |
| **`RankRow`** | Fila de ranking de coach: rango oro/plata/bronce + `HexAvatar` + métrica grande + 3 mini-stats + barra de celdas | `c` (view-model precalculado) | Ranking de equipo (dueño) |
| **`StarRating`** | 5 estrellas 1–5; cada estrella es botón con área táctil ≥44px aunque el glifo mida 25px | `value`, `onRate`, `size=25`, `label`, `readOnly` | Evaluación subjetiva por eje |
| **`LiveDot`** | Punto "vivo" que parpadea (`bg-blink`); `speed` desincroniza varios dots | `color=C.ok`, `size=9`, `speed='1.3s'`, `glow` | "En vivo", dots de riesgo |
| **`XPCells`** | Progreso como celdas segmentadas con mini-corte (`CELL`) y glow, no barra lisa | `filled`/`pct`, `cells=10`, `height=12`, `fill`, `fillGlow`, `cut`, `label` | Barra de XP / misiones |
| **`ArcadeBottomNav`** | Nav inferior (78px) por rol; variantes con **hex central elevado** | `variant` (`coach`/`padre`/`atleta`/`dueno`), `active`, `onNavigate` | Navegación principal de cada portal |

**Notas de accesibilidad ya cableadas en las primitivas** (heredarlas, no reinventarlas): `CutCard`/`HexAvatar` con `onClick` exponen `role="button"`, `tabIndex`, `aria-label` y `Enter/Espacio`; `StarRating`/`SegmentToggle` garantizan hit-target ≥44px con glifo más pequeño; `XPCells` es un `role="progressbar"` con `aria-valuenow`; `Donut`/`RadarChart` son `role="img"` con `aria-label`; `LiveDot` es `aria-hidden` (nunca es la única señal).

---

## 4. Reglas de composición

El molde de página es el **marco de teléfono**. Las tres pantallas de referencia comparten la misma anatomía (`VistaAtletaArcade`, `VistaDuenoArcade`, `ModoCanchaArcade`):

```
[ contenedor externo: minHeight 100dvh, centrado, background C.bgApp ]
  [ marco: width 100%, maxWidth 480, height 100dvh, flex column, ...gridBackground ]
    [ header de flujo — opcional (flex:none) ]
    [ área de scroll — flex:1, minHeight:0, overflowY:auto, padding ~18px 16px 26px ]
    [ minibar flotante / footer CTA — opcional (flex:none) ]
    [ ArcadeBottomNav — opcional (flex:none) ]
```

Reglas:

1. **Un solo marco, columna única.** `maxWidth: 480`, `height: 100dvh`, `display: flex; flexDirection: column`. En pantallas anchas el marco queda centrado en letterbox sobre `C.bgApp`.
   - **Gotcha conocido:** usar `height: 100dvh` (no `minHeight`) en el marco, con el área de scroll en `flex:1; minHeight:0; overflowY:auto`. De lo contrario el scroll interno se rompe y la bottom-nav flota.
2. **Header de flujo** (cuando hay un paso): chevron Atrás (34×34, `cut(7)`, borde neutro) + `MicroLabel` de paso (`C.goldDeep`, tracking `.12em`, ej. "PASO 2 · ASISTENCIA") + título 17px/900. Fondo `rgba(5,5,7,.6)`, borde inferior oro `.1`.
3. **Bottom-nav con hex central.** 78px de alto, fondo `rgba(5,5,7,.94)` con `backdrop-filter: blur(18px)`, borde superior teñido por rol. El **hex central** (Cancha del coach, Finanzas del dueño) es un botón `HEX` de 62px, elevado `top:-20`, con `GRAD.goldCTA150` y `drop-shadow` dorado — es el gesto de identidad de la nav. Padre/Atleta usan 4 zonas planas sin hex central; el acento del padre es azul info, no oro.
4. **Cards con esquina cortada.** Toda tarjeta es `background: C.card` + `border: 1px solid BORDER.*` + `clipPath: cut(n)`. La elevación se comunica con borde y tinte, no con sombra de color (salvo los glows tokenizados).
5. **Micro-labels uppercase para estructura.** Cada bloque se rotula con `MicroLabel` (pixel, MAYÚSCULA) — es la "voz de marcador" que ordena la pantalla ("ALERTAS · REQUIEREN ACCIÓN", "HOY EN EL CLUB").
6. **CTA persistente al pie.** Las acciones de flujo van en un footer fijo (`flex:none`), botón `cut(12)` a ancho completo, `GRAD.goldCTA`/`greenCTA` si habilitado o gris apagado si no. El label incluye el efecto ("FINALIZAR · +120 XP", "CONTINUAR · 8"). Verde = confirmar/guardar, oro = avanzar/finalizar.
7. **Grid de KPIs 2×2.** El patrón data-denso que ya existe (dueño): `display:grid; gridTemplateColumns:1fr 1fr; gap:10` de `KpiTile`. Es el germen de la extensión a desktop (§8).
8. **Un solo oro por vista** (regla DS v1, vigente aquí): el héroe/CTA/logro dorado es único; todo lo demás es oro translúcido o acento semántico.

---

## 5. Motion

Los keyframes viven **globales** en `tokens.css` (fuera de `@theme` a propósito, porque los consumen estilos inline `animation:'bg-...'`, no utilidades Tailwind):

| Keyframe | Efecto | Cuándo |
|---|---|---|
| `bg-blink` | Opacidad 1→.25→1 (60% del ciclo encendido) | Indicadores "vivos": ● de sesión activa, dots de riesgo (`LiveDot`) |
| `bg-pop` | `scale .6→1.12→1` con fade-in | Aparición con rebote: éxito, insignia desbloqueada, trofeo de cierre |
| `bg-rise` | `translateY(8px)→0` con fade-in | Filas de resultados en el reparto de XP |
| `bg-cursor` | Parpadeo duro 1/0 al 50% | Cursor de terminal en micro-labels de estado |
| `bg-glow-pulse` | `box-shadow` dorado 14px↔26px | Pulso del botón hex central de la nav |

Duraciones típicas: parpadeos 1.3–1.6s (desincronizados con `speed`), `bg-pop`/`bg-rise` ~.4s ease-out, transiciones de estado ~.15–.25s.

**Reglas duras (heredadas del DS v1, obligatorias en el HUD):**
- Respetar `prefers-reduced-motion` — global en `index.css` + `useReducedMotion()` en coreografías JS (ej. `ModoCanchaArcade` desactiva el `scale/y` de entrada del takeover).
- **Nunca `transition-all`.** Usar `transition` con lista curada o una propiedad específica (`transition: 'color .15s, text-shadow .15s'` como en `StarRating`).
- En loops, animar **solo** `transform`/`opacity`. `bg-glow-pulse` anima `box-shadow` a propósito y por eso se limita a un único elemento (el hex central), no a listas.
- Menos partículas/animación bajo 480px (ya somos móvil-first; al escalar a desktop, §8, la animación puede crecer pero sigue sujeta a reduced-motion).

---

## 6. Extensión a desktop y contextos data-densos

**Sección crítica.** El Arcade nació dentro de un marco de 480px; migrar staff/admin/sistema/coach y el legacy Tier C exige llevar el lenguaje a **tablas, formularios, filtros y layouts de ancho completo** sin perder identidad. Esta sección es el **yardstick** de esa migración. Regla rectora: **se conservan los átomos (retícula, cortes, hexágonos de identidad, oro, pixel para labels/números), se abandona el marco de 480px y se sube el piso de cuerpo a lo legible en desktop.**

### 6.1 Qué se conserva y qué cambia

| Se conserva (identidad) | Se adapta (para densidad/desktop) |
|---|---|
| Retícula dorada de fondo (`gridBackground`) | A ancho completo, a 40–48px de paso (no 36) para no saturar |
| Esquina cortada `cut()` como firma de superficie | Corte más discreto: `cut(8–10)` en contenedores grandes; sin corte en celdas internas de tabla |
| Hexágono `HEX` solo para identidad (avatar, logro) | Igual — nunca hexagonar filas ni celdas |
| Oro = logro/acción; un solo oro por vista | Igual, más estricto: en un panel admin con muchos datos, el oro se reserva al header/acción primaria |
| Silkscreen para números de marcador y micro-labels de columna | **Cuerpo y celdas de datos en Outfit**; pixel solo en encabezados de columna, totales y KPIs |
| Semánticos y `hue` del atleta | Igual, ahora como estados de fila/celda |
| Piso pixel 6.5–8px | **Sube a 9px** el piso general; el pixel <9px solo en encabezados de columna cortos |

### 6.2 Patrón: **Tabla-HUD**

Para roster, pagos, altas/bajas, auditorías. La tabla es una `CutCard` grande cuyo interior es una rejilla, no un marco de teléfono.

- **Contenedor:** `CutCard cut(10)`, `background: C.card`, `border: BORDER.neutral`. Ancho completo del área de contenido (no 480px). Scroll horizontal propio en `<md` (`overflow-x:auto`).
- **Cabecera de columna:** `MicroLabel` (pixel, MAYÚSCULA, `C.text3`, ~9px) sobre una fila con `borderBottom: 1px solid BORDER.neutral06`. Alineación numérica a la derecha, `tabular` implícito por Silkscreen.
- **Celdas de datos:** **Outfit** 12–13px (nunca pixel para nombres/textos largos), `C.text`/`C.text2`. Números y métricas: pixel, tamaño 11–13, color semántico (`hueFg` para estado, `C.gold` para el dato destacado, `C.ok`/`C.danger` para deltas).
- **Fila:** altura ≥44px (densa desktop ≥36px, var `--control-height-compact`). Hover desktop: `background: rgba(255,255,255,.03)` (patrón "hover de fila" del DS v1) + borde que despierta a oro `.3`. Estado de fila por borde-izquierda de 2–3px con el color semántico (deuda = `C.danger`, al día = `C.ok`), no por teñir toda la fila.
- **Separadores internos:** líneas `rgba(255,255,255,.06)` a 1px, **no** `cut` por celda (el chaflán se reserva al contenedor). La barra de celdas proporcional de `RankRow` (`c.cells`) es el patrón canónico para una mini-viz embebida en fila.
- **Rango/posición:** número en pixel con color oro/plata/bronce (como `RankRow`), avatar `HexAvatar` size 34–38.
- **Selección/acción de fila:** usar `CutCard onClick` (ya accesible) o un botón-icono `cut(7)` al final de la fila.

### 6.3 Patrón: **Formulario-HUD**

Para catálogos de servicios, config de club, alta de atleta.

- **Campo:** hereda `.arcade-input` (el placeholder ya toma `--color-fg-muted`). Contenedor de campo con `background: C.cardAlt1`, `border: BORDER.neutralSoft`, `clipPath: cut(7)`, `min-h-11` (44px táctil / 36px denso desktop). Foco: borde a `BORDER.goldStrong` + el anillo dorado global de `:focus-visible`.
- **Label = `MicroLabel`** (pixel, MAYÚSCULA, `C.text3`) encima del campo. Error: borde `BORDER.danger` + mensaje Outfit 10–12px en `C.danger`.
- **Layout:** en desktop, grilla de 2 columnas (`gridTemplateColumns: 1fr 1fr; gap:16`); en móvil colapsa a 1 columna. Los grupos de campos van en `CutCard cut(10)` con `MicroLabel` de sección arriba.
- **Toggles/segmentos:** reutilizar `SegmentToggle`/`Pill` (ya táctiles y accesibles). Selects como `Pill` en fila cuando el dominio es corto (P/A, género, nivel).
- **Acciones:** el CTA primario sigue la regla del footer HUD (oro `GRAD.goldCTA` para guardar, un solo oro). Cancelar = ghost (`background: rgba(255,255,255,.05)`, borde neutro).

### 6.4 Patrón: **Panel admin denso**

Para dashboards de staff/owner de ancho completo (la evolución de `VistaDuenoArcade` fuera del marco).

- **Layout:** grilla responsiva de tarjetas — `gridTemplateColumns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12–16`. El grid 2×2 de `KpiTile` se generaliza a `auto-fit`; en desktop caben 4–6 KPIs por fila.
- **Barra de filtros:** patrón colapsable del DS v1 (§4.3b) traducido al HUD — buscador `.arcade-input` siempre visible + botón "Filtros" (`Pill` con contador de activos en `HexAvatar` mini o badge). Colapsado en `<md`, inline en desktop. Chips de filtros activos como `Pill active` con `×`.
- **Header de panel:** título Outfit 24–26/900 + `HexAvatar` de identidad + `MicroLabel` de fecha/contexto (patrón exacto de `VistaDuenoArcade`).
- **Viz:** `Donut`, `Heatmap`, `RadarChart` funcionan tal cual a ancho mayor (son SVG con viewBox); escalan con el contenedor. Para series nuevas, respetar la restricción CVD del DS v1 (§4.9): color nunca como única codificación.

### 6.5 Breakpoints

El HUD no tenía breakpoints (era 480px fijo). Al converger la app se adopta la escala del DS v1:

- **`<md` (móvil):** marco de teléfono clásico donde el flujo es táctil (atleta, padre, Modo Cancha). Controles 44px. Filtros colapsados. Tablas con scroll horizontal.
- **`md`–`lg` (tablet/desktop pequeño):** el marco de 480px cede a ancho completo con márgenes; grids 2 columnas; controles pueden bajar a 36px denso.
- **`≥lg` (desktop admin):** layout de ancho completo con sidebar/toolbar; tablas-HUD y paneles densos; controles 36px; retícula a 40–48px; piso de cuerpo 12–13px, pixel ≥9px salvo encabezados de columna.
- **Regla de rol (DS v1 §6):** atleta/padre siempre táctil 44px; coach/owner/staff admiten modo denso 36px en desktop. El rol **no** cambia tokens, cambia densidad y jerarquía.

---

## 7. Gobernanza

Rigen **todas** las reglas del DS v1 §8 (no reproducir hex, prohibir arbitrarios de color/tamaño, un solo oro por vista, nuevos mapas de color solo en el archivo de tokens, nunca `transition-all`, no reintroducir `outline-none` sin reemplazo) **más** las propias del Arcade:

1. **`arcadeTokens.js` es la única fuente de valores del HUD.** Las pantallas y primitivas **componen** con `C`/`BORDER`/`GRAD`/`GLOW`/`cut`/`HEX`/`CELL`/`hueFg`/`hueBg`/`PIXEL`; **no escriben color, gradiente ni clip-path arbitrario inline**. Si falta un valor, se añade a `arcadeTokens.js` primero.
2. **Formas por semántica:** `HEX` solo identidad, `cut` solo contenido, `CELL` solo celdas de progreso. No mezclar.
3. **Pixel acotado:** Silkscreen solo en números de marcador y micro-labels MAYÚSCULA; el cuerpo va en Outfit. Sin cuerpo en pixel.
4. **Un solo oro por vista** y el glow siempre atado a oro o estado.
5. **Accesibilidad no negociable:** hit-target 44px (36px denso desktop), `role`/`aria` de las primitivas heredados, color nunca como única señal, `prefers-reduced-motion`, anillo de foco dorado global.
6. **La convergencia sigue este documento como yardstick:** cualquier pantalla nueva (staff/admin/sistema/coach) que se migre al Arcade debe (a) usar las primitivas y `arcadeTokens`, (b) seguir los patrones de §6 para densidad, (c) subir el piso de cuerpo a 9px fuera del marco de 480px.

---

## 8. Nota de deuda

Estos archivos **escriben hex/valores inline** que deberían vivir en `arcadeTokens.js` (regla de gobernanza §7.1). Migrar oportunistamente, archivo por archivo, sin cambiar el aspecto:

| Archivo | Deuda concreta | Destino |
|---|---|---|
| `arcade/RadarChart.jsx` | Defaults `accent='#FFD700'`, `fill='rgba(255,215,0,.18)'`; strokes `rgba(255,255,255,.07)`, `rgba(255,215,0,.12)`; vértice sel. `#FFEB66`; labels `#9CA3AF`; `fontFamily="Silkscreen"` literal | `C.gold`, un `GRAD`/token de fill de radar, `C.goldLight`, `C.text2`, `PIXEL` |
| `arcade/SegmentToggle.jsx` | Color ausente-marcado `'#FFFFFF'` inline | token de texto sobre rojo (p. ej. `C.text` o un `onDanger` nuevo) |
| `arcade/PantallaAtletaProgreso.jsx` | Gradiente de conector de rangos `linear-gradient(90deg,#22D3EE,#FFD700)`; insignias re-implementan `Badge` con `rgba(255,215,0,.45)`/`GRAD.goldHex` inline en vez de usar `<Badge>` | nuevo `GRAD` (cian→oro); reutilizar la primitiva `Badge` |
| `arcade/VistaPadreArcade.jsx` | Radar inline con `#60A5FA`, `#9CA3AF`, `rgba(96,165,250,.18)`, `fontFamily="Silkscreen"` literal (duplica `RadarChart`); varios `rgba(52,211,153,.x)` y `rgba(37,211,102,.45)` sueltos | reemplazar el radar inline por `<RadarChart>`; usar `C.*`/`BORDER.*`/`PIXEL` |

Patrón general de estos casos: (a) hex que ya tienen token equivalente en `C`/`BORDER` y se escribieron a mano, (b) `"Silkscreen"` literal donde debería ir `PIXEL` (rompe el fallback del token CSS), y (c) primitivas re-implementadas inline (`Badge`, `RadarChart`) en vez de importadas. Cualquier hex nuevo en pantallas del Arcade es una **regresión**.
