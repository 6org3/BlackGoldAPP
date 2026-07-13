# Auditoría UI/UX — Convergencia a Arcade HUD

> Fecha: 2026-07-13 · Alcance: Dashboard_Premium (los 5 roles) · Norte fijado por producto: converger **toda** la app al lenguaje visual **Arcade HUD**.

## 0. Contexto

El rediseño de Black Gold se percibe **"por partes"**: pantallas nuevas estilo **Arcade HUD** (marcador de videojuego, pixel/hexágonos, retícula dorada) conviviendo con pantallas de **estética anterior**. Esta auditoría (a) cuantifica esa inconsistencia superficie por superficie, (b) compara los *handoffs* de diseño trabajados para cada rol contra el estado real y el destino Arcade, y (c) entrega un roadmap de convergencia. Se acompaña de dos **clubes de prueba sembrados** que permiten demostrar el funcionamiento con datos simulados y sirvieron de banco para el pase visual en vivo.

**Cómo se produjo** (orquestación multi-agente, "Fable" orquesta · Opus/Sonnet construyen):
- Se codificó primero el lenguaje Arcade como sistema de diseño de referencia — [`docs/design_system_arcade.md`](design_system_arcade.md) — porque no existía handoff versionado (el `arcadeTokens.js` apunta a un prototipo `Screen.dc.html` que **no está en el repo**). Ese documento es la **vara de medir** de esta auditoría.
- Un workflow de 48 agentes auditó 11 superficies (Sonnet inventaría hex/tap-targets/a11y, Opus juzga heurísticas y conformidad), comparó los handoffs por rol, **verificó de forma adversarial** los 27 hallazgos de severidad alta (20 confirmados, 4 refutados por matiz de producto) y sintetizó el roadmap.
- Se sembraron dos clubes demo y se hizo un **pase visual en vivo** logueándose por cada rol contra la app corriendo (§5).

---

## 1. Resumen ejecutivo

El producto convive hoy en **tres capas visuales** que no hablan el mismo idioma:

- **Capa A — Arcade HUD (el norte).** Marco de teléfono 480px, `gridBackground`, `cut()`/HEX, tipografía PIXEL/Silkscreen y primitivas (`HexAvatar`, `CutCard`, `KpiTile`, `XPCells`, `Donut`, `RadarChart`, `ArcadeBottomNav`) sobre `arcadeTokens`. Nativa en los **4 homes gamificados + Modo Cancha**: `dueno` (87%), `modo-cancha` (90%), `atleta` (82%), `padre` (80%). Conformidad alta; deuda solo de tokens (§8 del DS Arcade) y tap-targets.
- **Capa B — DS v1 tokenizado.** Limpia (sin hex crudo), pero años-luz del Arcade: `sistema` (30%), `coach-home` (28%), `dashboard-staff` (20%), `admin` (24%), `auth` (18%). Otro idioma: `rounded-*` + `glass-card`, avatares circulares, sin fuente pixel ni formas cortadas.
- **Capa C — Legacy Tailwind crudo.** `zinc/amber/yellow/purple`, `rounded-xl/2xl`, `text-[Npx]` arbitrarios, sin tokens. Contamina superficies de staff: `ficha-atleta-legacy` (15%) y `athlete-legacy-layout` (18%).

**El choque** es visible dentro de una misma pantalla: la ficha de atleta del staff monta una `AtletaCard` tokenizada (DS v1) que abre un `ProgresoNivelModal` en `zinc/yellow` crudo — dos dialectos ajenos, y **ninguno** Arcade. El mismo atleta con el mismo XP/rango se ve como marcador Arcade en `VistaAtletaArcade` y como tarjeta glass genérica en la ficha del staff.

**Veredicto de convergencia.** El norte (todo a Arcade HUD) es **alcanzable pero no automático**. La mitad gamificada ya está en el norte (esfuerzo S–M: pulido). La mitad de staff/admin es data-densa y desktop, y el Arcade **nació móvil-first a 480px**: migrarla es esfuerzo L–XL y exige **primero extender el propio lenguaje Arcade a densidad/desktop** (patrones Tabla-HUD, Formulario-HUD, Panel denso — hoy teóricos en el §6 del DS Arcade). **Matiz de gobernanza:** varios hallazgos de "conformidad-arcade" en staff fueron **refutados** en la verificación porque el proyecto mantiene *deliberadamente* dos lenguajes por clase de superficie (homes-nativos vs HUD-en-cancha); **ratificar con producto que los homes/admin también convergen es prerequisito bloqueante** de la Ola 2.

---

## 2. Mapa de superficies

| Superficie | Rol | Tier real | Conformidad Arcade | Esfuerzo |
|---|---|---|---|---|
| modo-cancha | coach | **A — Arcade** | 90% | S |
| dueno-arcade (`/club`) | owner | **A — Arcade** | 87% | S |
| atleta-arcade (`/atleta`) | atleta | **A — Arcade** | 82% | S |
| padre-arcade (`/padre`) | padre | **A — Arcade** | 80% | M |
| sistema (`/sistema`) | superadmin | B — tokenizado | 30% | L |
| coach-home (`/coach`) | coach | B — tokenizado | 28% | L |
| admin-modules (`/admin/*`) | staff | B — tokenizado | 24% | XL |
| dashboard-staff (`/dashboard`) | staff | B — tokenizado | 20% | XL |
| athlete-legacy-layout (`/dashboard` atleta) | atleta | Mixto (B+C) | 18% | L |
| auth (`/login`·`/registro`) | público | B — tokenizado | 18% | M |
| ficha-atleta-legacy (drill-down) | staff | **Mixto (B+C)** | 15% | XL |

**11 superficies.** Conformidad media grosera: mitad Arcade ≈85%, mitad staff/legacy ≈21%.

---

## 3. Comparación de handoffs por rol

| Rol | Intención (blueprint / DS v1) | Estado actual | Destino Arcade | Brecha | Esfuerzo |
|---|---|---|---|---|---|
| **superadmin** | Panel admin data-denso de ancho completo (KPIs, tablas, auditoría), modo 36px desktop, nunca 480px | Tier B tokenizado, sin capa Arcade. El portal más lejos del norte; no hay `VistaSistemaArcade` de referencia | Panel denso + Tabla-HUD + Formulario-HUD: grid auto-fit de `KpiTile`, tablas como `CutCard` con borde-izq semántico de fila, pixel solo en encabezados/totales, un solo oro al header | Migración completa + **validar en producción los patrones desktop-densos (hoy teóricos)**. Faltan tablas-HUD, filtros colapsables, breakpoints | **XL** |
| **owner** | Dashboard de KPIs del club; la vista ya-Arcade más data-densa | Arcade A con datos reales parciales. `VistaDuenoArcade` es referencia (grid 2×2 `KpiTile`, `Donut`, `Heatmap`, `RankRow`); wiring v31/v32 avanzado | Generalizar el marco 480px al Panel denso: grid auto-fit 4-6 KPIs/fila, filtros colapsables, header `HexAvatar`+`MicroLabel`. Donut/Heatmap/Radar escalan solos (SVG) | Cerrar wiring de datos reales + sacar la vista del marco de teléfono a ancho completo. Sin migración estructural | **M** |
| **coach** | Grilla de atletas + sesión del día; Modo Cancha como flujo táctil en vivo | **Personalidad partida**: `/coach` sigue Tier B, pero Modo Cancha YA es Arcade A (referencia). `RankRow` pensada para el ranking del coach | Converger `/coach` a Arcade **sin tocar Modo Cancha**: roster y Gestionar Atletas como Tabla-HUD con `HexAvatar`, filtros colapsables, evaluación reutilizando `StarRating`/`RadarChart` | Migrar el portal clásico (roster, gestión, filtros, evaluación). Modo Cancha ya hecho → menor riesgo. Subir piso a 9px + densidad 36px | **L** |
| **atleta** | Héroe = rango + barra XP; el portal que definió el lenguaje | Arcade A completo. `VistaAtletaArcade` de referencia; racha/insignias con datos reales verificados E2E (#49/#50) | Ya está en el norte. Consolidar: reemplazar re-implementaciones inline por primitivas, limpiar hex sueltos, mantener táctil 44px | Solo deuda de tokens: `PantallaAtletaProgreso` re-implementa `Badge` inline, gradiente conector cian→oro y `'Silkscreen'` literal en vez de `PIXEL` | **S** |
| **padre** | Héroe = estado del atleta + pagos; identidad azul info | Arcade A. `VistaPadreArcade` de referencia (acento azul info). Sub-vistas de pagos aún DS v1 clásico | Mantener el Arcade azul-info; reemplazar radar inline por `<RadarChart>`; migrar Estado de Cuenta/comprobantes a Formulario-HUD y Tabla-HUD | Deuda: `VistaPadreArcade` duplica `RadarChart` inline (`#60A5FA`, `'Silkscreen'` literal). Migrar las sub-vistas de pagos, que aún no son Arcade | **M** |

---

## 4. Verificación en vivo (clubes de prueba)

Se sembraron dos clubes con datos simulados (todo el proyecto es data de prueba) y se hizo un pase logueándose por cada rol contra la app corriendo. **Todos los portales renderizaron datos reales del seed** — lo que demuestra a la vez el funcionamiento E2E y la inconsistencia estética.

**Clubes sembrados** (scripts idempotentes con `SEED_REAL=1`, dry-run por defecto):
- **"DEMO Simulación 1 Año"** (demo rica): 30 atletas · 3 grupos · 960 evaluaciones · 3 936 asistencias · 240 pagos + 209 transacciones · 132 `xp_eventos` · 420 misiones · 3 eventos · membresía/retención. Scripts: [`simular_club_nuevo_1anio.mjs`](../Dashboard_Premium/scripts/simular_club_nuevo_1anio.mjs) + [`sembrar_club_demo_completo.mjs`](../Dashboard_Premium/scripts/sembrar_club_demo_completo.mjs).
- **"DEMO QA Compacto"** (QA rápida): 12 atletas · 2 grupos · snapshot actual. Script: [`sembrar_club_qa_compacto.mjs`](../Dashboard_Premium/scripts/sembrar_club_qa_compacto.mjs).
- Reset seguro: `limpiar_simulacion_club_demo.mjs`. Verificación: [`verificar_seed_demo.mjs`](../Dashboard_Premium/scripts/verificar_seed_demo.mjs) (conteos + smoke de login, 9/9 OK).

**Cuentas logueables** (identificador = contraseña = cédula): `DEMO-OWNER-001`, `DEMO-SUPERADMIN-001`, `DEMO-COACH-001`, `DEMO-ATL-001/011/021`, `DEMO-PADRE-001`; compacto: `QAC-OWNER/SUPERADMIN/COACH/ATLETA/PADRE`.

**Lo observado en vivo (todos con datos reales):**

| Rol · ruta | Tier visible | Evidencia renderizada |
|---|---|---|
| owner · `/club` | **Arcade A** | `RECAUDADO·JUL $560 (62% de meta)`, `ASISTENCIA 83%`, `28 ATLETAS ACTIVOS`, `EN RIESGO 2 (3 de baja·1 pago)`, alertas "3 pagos vencidos $140 en mora", "HOY EN EL CLUB · 3 sesiones" |
| coach · `/coach` | **Tokenizado B** | Plantel real (Amelia Erazo Sub-16, Joaquín Yépez PROSPECT), card IA "Atletas a mirar hoy", "Foco de desarrollo · FUERZA 35/100" |
| atleta · `/atleta` | **Arcade A** | `MATEO CEVALLOS · MINI(SUB-11) · MICRO · 39 PWR · XP 250/1000 (25%) · faltan 750 XP → Prospecto`, misión destacada "Aterrizajes de ninja +50 XP" |
| atleta · `/dashboard` | **Legacy C/B** | Mismo atleta como layout viejo: "39 OVERALL · ROOKIE · Radar de pilares" (el respaldo divergente) |
| padre · `/padre` | **Arcade A** | "Mi representado · Representante de Doménica Salazar", nav BASE/MISIONES/EVENTOS/PAGOS |
| superadmin · `/sistema` | **Tokenizado B** | "Operador de plataforma · El sistema", "Cerebro del club · blackgold-mcp 18 tools", módulos + plantel cross-club |

El contraste **owner (Arcade) vs coach/sistema (tokenizado)** — dos roles de gestión con lenguajes distintos — es la inconsistencia central; y el mismo atleta viéndose Arcade en `/atleta` y legacy en `/dashboard` es la duplicidad más confusa.

---

## 5. Hallazgos priorizados

### Severidad ALTA (verificados adversarialmente)

| # | Superficie | Categoría | Archivo:línea | Verif. | Resumen |
|---|---|---|---|---|---|
| 1 | sistema | a11y-CVD | `src/pages/SistemaHomePage.jsx:136` | Confirmado→media | Barra de salud por club solo por color, sin % numérico; CVD no distingue verde/ámbar/rojo |
| 2 | coach-home | tap-target | `src/components/CardFocoAtleta.jsx:93` | Confirmado→media | `+ Asignar`/`Pregúntale` a 40px, bajo el piso de 44px |
| 3 | coach-home | conformidad | `src/pages/CoachHomePage.jsx:111` | **Refutado** | Homes-nativos vs HUD-en-cancha es separación deliberada; norte no confirmado |
| 4 | coach-home | avatar dup. | `src/components/CardFocoAtleta.jsx:52` | Confirmado→media | Avatar circular con inicial duplicado inline (`:52` y `CoachHomePage:176`) |
| 5 | dueno-arcade | tap-target | `src/components/arcade/PanelFinanzas.jsx:15` | Confirmado→media | Botón de fila de pago (~26-28px) bajo 44px; acción financiera frecuente |
| 6 | dueno-arcade | tap-target | `src/components/arcade/PanelRetencion.jsx:41` | **Refutado** | `Dar de baja` usa patrón arm→confirm y es reversible; no destructivo de un toque |
| 7 | atleta-arcade | tap-target | `src/components/arcade/PantallaAtletaProgreso.jsx:61` | Confirmado→media | 7 filas de pilar como `<button>` ~32-34px (hay vía paralela en radar) |
| 8 | atleta-arcade | tap-target | `src/components/arcade/PantallaAtletaInicio.jsx:118` | Confirmado→media | RSVP `¿VAS?/VOY` ~30-32px sin min-height |
| 9 | modo-cancha | tap-target | `src/components/arcade/ModoCanchaArcade.jsx:209` | Confirmado→media | Chevron Atrás 34×34px; §4.2 lo documenta pero choca con §7.5 (44px) |
| 10 | modo-cancha | tap-target | `src/components/arcade/PantallaLista.jsx:18` | Confirmado→media | `TODOS ✓` ~28-30px; cumple WCAG 24px pero no la guía de plataforma |
| 11 | modo-cancha | contraste | `src/components/arcade/PantallaLista.jsx:105` | Confirmado→media | `C.text3` a 9-10px ≈4.0-4.2:1, bajo AA 4.5:1 |
| 12 | dashboard-staff | conformidad | `src/components/Sidebar.jsx:192` | **Refutado** | Sidebar no co-presente con superficies Arcade (takeovers full-screen) |
| 13 | dashboard-staff | a11y-semántica | `src/components/Sidebar.jsx:241` | Confirmado | `NavItem` activo sin `aria-current`; estado solo por color+borde+glow |
| 14 | ficha-atleta-legacy | a11y-foco | `src/components/AsignadorMisiones.jsx:204` | Confirmado→media | `outline-none` desnudo en 9 inputs/selects; foco de teclado invisible |
| 15 | ficha-atleta-legacy | legibilidad | `src/components/AtletaCard.jsx:71` | Confirmado | Badges clínicos en `text-[8px]/[7px]`, bajo el piso de 9px |
| 16 | ficha-atleta-legacy | a11y-motion | `src/components/AtletaCard.jsx:41` | **Refutado** | `<MotionConfig reducedMotion="user">` global (main.jsx:111) ya cubre la app |
| 17 | ficha-atleta-legacy | conformidad | `src/components/AtletaCard.jsx:45` | Confirmado | Avatar círculo + glass-card donde el HUD exige `HexAvatar`/`CutCard`/`XPCells` |
| 18 | admin-modules | conformidad | `src/components/AdminPagos.jsx:217` | Confirmado (discutible) | DS v1 puro sin primitivas Arcade; puede ser intencional (CRUD) |
| 19 | admin-modules | a11y | `src/components/AdminComunicaciones.jsx:290` | Confirmado→media | Quitar destinatario `24px`; bajo el 44px interno |
| 20 | admin-modules | a11y | `src/components/AdminMisiones.jsx:683` | Confirmado→media | Botones-icono editar/eliminar ~30-32px; acción destructiva |
| 21 | admin-modules | legibilidad | `src/components/AdminPagos.jsx:382` | Confirmado→media | Encabezados de columna en `text-[8px]`, bajo el piso |
| 22 | admin-modules | a11y-foco | `src/components/AdminMisiones.jsx:389` | Confirmado | `focus:outline-none` en ~38 inputs neutraliza el anillo global |
| 23 | auth | tap-target | `src/components/Login.jsx:139` | Reportado | `Regístrate Aquí` ~16-20px; único puente a alta, degrada conversión |
| 24 | auth | tap-target | `src/pages/RegistroPage.jsx:175` | Reportado | `Iniciar Sesión` `text-xs` sin padding, hit-target sub-44px |
| 25 | auth | a11y-aria | `src/components/Login.jsx:114` | Reportado | Errores sin `role="alert"`/`aria-live` (ídem `RegistroPage:83`) |
| 26 | athlete-legacy-layout | conformidad | `src/components/AthleteLayout.jsx:56` | Reportado | Cero adopción Arcade; DS v1 puro divergente del home Arcade del atleta |
| 27 | athlete-legacy-layout | legibilidad | `src/components/EventosAtleta.jsx:191` | Reportado | `text-[8px]` en insignias de evento y badge Cancelado |

### Severidad MEDIA (transversal)
- **Contraste `fg-muted`/`C.text3` (~4.0-4.1:1) bajo AA 4.5:1** en 7 superficies a 9-10px (`sistema:142`, `coach-home:181`, `BottomNav:31`, `PantallaAtletaProgreso:86`, `padre:334`, `Login:134`, `AthleteLayout:67`) — agravado por uso exterior (sol de Ecuador).
- **Deuda de tokens (hex/rgba/glow inline en superficies ya-Arcade)**: `PanelAsistencia:18/52`, `PanelRetencion:12`, `VistaDuenoArcade:43`, `PantallaAtletaProgreso:41/83`, `VistaPadreArcade:57/59/351`, `ModoCanchaArcade:259`, glows en `Sidebar:68`, `AdminMisiones:362/490`, `Login:80/99`.
- **Primitivas reimplementadas inline**: `RadarChart` duplicado en `VistaPadreArcade:57`; `Badge` en `PantallaAtletaProgreso`; `'Silkscreen'` literal en vez del token `PIXEL` (rompe el fallback `--font-pixel`).
- **Contenido hardcodeado que miente sobre el dato**: `PantallaEvaluar:32` (`Sub-16`/`Físico` fijos) — debe derivar de `calcularCategoriaFEB`/sesión.
- **`window.confirm()`/`alert()` nativos** en flujo destructivo: `AdminMisiones:280`.
- **Copy de dominio críptico**: `Login:129` (`Desbloquear Poneglyph`, `Validando ADN...`).

### Severidad BAJA (agrupada)
Datos hardcodeados en card MCP (`SistemaHomePage:157`); `reduced-motion` sin guard local (varias vistas); glows/blobs arbitrarios (`HomeShell:47`, `App.jsx:70`, `RegistroPage:73`); Silkscreen a 8px sin uppercase (`PantallaEvaluar:62`); nav plana sin agrupación (`Sidebar:106`).

---

## 6. Roadmap de convergencia a Arcade HUD (por olas)

### Ola 0 — Extender el lenguaje Arcade a desktop/data-denso (PREREQUISITO)
Sin esto las Olas 2-3 son imposibles: el Arcade nació a 480px y su §6 avisa que escalar a densidad es "trabajo explícito, no automático".
- **PR 0.1** — Validar en `design_system_arcade.md §6` los patrones **Tabla-HUD**, **Formulario-HUD** y **Panel admin denso** con breakpoints md/lg, retícula 40-48px y piso de cuerpo a 9px.
- **PR 0.2** — Implementar las primitivas densas de referencia (`TablaHUD`, barra de filtros colapsable, grid auto-fit de `KpiTile`), usando `VistaDuenoArcade` como banco de pruebas.
- **PR 0.3** — Saldar la deuda de tokens en las 4 superficies ya-Arcade: tokenizar hex/rgba/glow, `RadarChart` inline del padre → primitiva, `'Silkscreen'` → `PIXEL`, ampliar hit-areas críticas a 44px **sin cambiar lo visual**.
- Esfuerzo M-L · riesgo bajo · **bloquea Olas 1-3.**

### Ola 1 — Migrar Tier C legacy que contamina staff (cadena ficha-atleta)
La única capa con hex crudo `zinc/amber/yellow` y dos dialectos en una misma pantalla; el peor mismatch del producto.
- **PR 1.1** — Tokenizar `ProgresoNivelModal`, `AsignadorMisiones`, `RangoProgreso`: eliminar paleta cruda, unificar oro a `#FFD700`, añadir anillo de foco visible.
- **PR 1.2** — Migrar `AtletaCard` + `RangoProgreso` a primitivas Arcade (`HexAvatar`, `CutCard`, `XPCells` con `role=progressbar`), marcadores en PIXEL, subir badges al piso.
- **PR 1.3** — Migrar `athlete-legacy-layout` (`AthleteLayout`, `EventosAtleta`, `ReadinessModal`): sliders a 44px, colores a tokens, `text-[8px]` → piso.
- Esfuerzo XL + L · depende de Ola 0.

### Ola 2 — coach-home + sistema a Arcade
- **PR 2.1** — `coach-home`: `HexAvatar` compartido (elimina duplicación), cards a `CutCard`, botones a 44px, tokenizar glow. **No tocar Modo Cancha.**
- **PR 2.2** — `sistema`: crear `VistaSistemaArcade` sobre Panel denso + Tabla-HUD. **Fix crítico CVD** en la barra de salud (% numérico + segunda señal + `role=progressbar` → `XPCells`).
- **Decisión previa bloqueante:** ratificar con producto que los homes-nativos SÍ convergen (hallazgos #3 y #12 se refutaron por asumir un norte no confirmado).
- Esfuerzo L + L · depende de Ola 0.

### Ola 3 — /admin/* densos + Plantel + login/registro
- **PR 3.1** — `admin-modules` (8): Tabla/Formulario-HUD/Panel denso, reemplazar `confirm/alert` por modal HUD, `aria-live`, anillo de foco en ~38 inputs. Migrar sub-vistas de pagos del padre aquí.
- **PR 3.2** — `dashboard-staff` shell: `Sidebar`/`BottomNav` a formas Arcade, `aria-current`, agrupar nav, tokenizar glows.
- **PR 3.3** — `Plantel` embebido a grid Arcade.
- **PR 3.4** — `auth`: campos como `CutCard`, hit-targets a 44px, `role=alert` en errores, copy → lenguaje real.
- Esfuerzo XL + XL + L + M · depende de Ola 0.

**Secuencia:** 0 → 1 → (2 ∥ 3). Olas 2 y 3 se paralelizan (superficies disjuntas).

---

## 7. Riesgos y decisiones abiertas

1. **Móvil-first → desktop (riesgo estructural mayor).** Toda la Capa B/C de staff es data-densa y de ancho completo; el Arcade nació a 480px. Si la Ola 0 no valida los patrones §6 en producción, las Olas 2-3 heredan riesgo de rediseño no acotado. **Decisión:** ¿un solo layout responsive Arcade, o Arcade-mobile + variante densa-desktop coexistiendo?
2. **¿Converge TODO, o coexisten dos lenguajes por clase de superficie?** Dos hallazgos de conformidad (#3, #12) se **refutaron** porque hoy hay homes-nativos DS v1 + HUD-en-cancha sin choque intra-pantalla. **Decisión de producto pendiente y bloqueante de Ola 2**: ratificar que homes/admin también son destino Arcade, o congelar la Capa B como lenguaje válido para superficies no gamificadas.
3. **Densidad de datos vs. gramática Arcade.** Tablas/formularios/filtros no caben en 480px sin los patrones §6.2/§6.3/§6.4. La regla propuesta (no cortar celdas, borde-izq semántico de fila) debe probarse antes de escalar.
4. **Contraste `fg-muted`/`C.text3` (~4.0-4.1:1) sistémico.** 7 superficies a 9-10px, bajo AA 4.5:1. Fix transversal barato de alto impacto: subir el token a `text2` para tamaños <12px, o fijar un piso de tamaño — **hacerlo en Ola 0** para no repetirlo por superficie.
5. ~~**Bug funcional `generar_pagos_mes` — `MIN(uuid)` rompe "Generar Mes".**~~ **RESUELTO (2026-07-13).** La RPC (`v28:51`) hacía `MIN(pa.padre_id)` y Postgres no tiene `min(uuid)`, por lo que fallaba en planificación siempre que se invocaba: el botón "Generar Mes" del dueño y el pg_cron mensual estaban rotos. Corregido en la migración `20260713225915_v28b_fix_generar_pagos_mes_min_uuid.sql` (fallback por `ORDER BY pa.padre_id LIMIT 1`), ya aplicada a la base remota y mergeada en `main` ([PR #51](https://github.com/6org3/BlackGoldAPP/pull/51)). Verificado contra la base real: la RPC genera sin error, es idempotente, y el descuento por hermanos aplica solo a las mensualidades más baratas de cada familia (la más cara paga completo). Ya no bloquea la migración de la UI de pagos (Olas 1/3).
6. **`prefers-reduced-motion` depende de regla global** (`main.jsx:111`, verificado). Riesgo bajo; decisión: ¿exigir guard local en coreografías o confiar en el proveedor global?

---

## Anexos

- **Sistema de diseño de referencia:** [`docs/design_system_arcade.md`](design_system_arcade.md) — el lenguaje Arcade codificado (la vara de esta auditoría), incl. §6 extensión desktop/densa y §8 deuda de tokens.
- **Dashboard visual** de la auditoría (comparativa de capas + roadmap): Artifact publicado aparte.
- **Scripts de siembra/verificación:** `Dashboard_Premium/scripts/sembrar_club_demo_completo.mjs`, `sembrar_club_qa_compacto.mjs`, `verificar_seed_demo.mjs`, `limpiar_simulacion_club_demo.mjs`.
- **Método:** workflow de 48 agentes (Sonnet inventario · Opus juicio/verificación/síntesis), verificación adversarial de los 27 hallazgos altos (20 confirmados, 4 refutados, 3 solo reportados), + pase visual en vivo de los 5 roles.
