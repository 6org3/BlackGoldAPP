# CLAUDE.md

Guía para asistentes de IA (y personas) que trabajen en este repositorio.

## Qué es este repo

Black Gold — un ecosistema de club de baloncesto para el club en Sucumbíos (Ecuador). Es una bóveda de Obsidian (documentación del club en `docs/`) más dos aplicaciones web.

- `Dashboard_Premium/` — la app principal. React + Vite (PWA), backend en Supabase. Aquí ocurre el desarrollo activo.
- `blackgold-mcp/` — servidor MCP del proyecto (proceso Node por stdio que se conecta a Supabase y expone herramientas analíticas como `analyze_athlete_pillars`). Objetivo: evolucionar hacia una **capa de analítica compartida** (extraer las reglas de análisis —pilares, baremos, etc.— a un módulo común que usen tanto la web app como el MCP, sin duplicar lógica).
- `docs/` — notas de metodología y estrategia del club (entrenamiento, táctica, mentalidad, corporativo, comunicaciones). En español.
- `supabase_migration_v*.sql` (raíz) — migraciones SQL ordenadas, aplicadas a mano en el SQL Editor de Supabase.

## Stack técnico (Dashboard_Premium)

- React + Vite, clases utilitarias de Tailwind, Framer Motion, íconos lucide-react.
- Supabase (Postgres + Auth + RLS) accedido a través de `src/api/*Service.js`.
- Gráficos tipo Recharts/D3 para métricas del atleta (radar, histórico).
- Desplegado en Vercel (`vercel.json`).

## Convenciones

- La capa de API vive en `src/api/`, un `*Service.js` por dominio (atletas, sesiones, comunicaciones, pagos, etc.). Los componentes/páginas llaman a estos servicios, no a Supabase directamente.
- El texto de la UI y el lenguaje de dominio están en **español** (categoría, atleta, grupo, convocatoria). Mantenerlo así para los textos de cara al producto.
- La categoría del atleta se deriva de la fecha de nacimiento con `calcularCategoriaFEB()` en `src/api/utilsAtletas.js` (Premini Sub-9 … Mayores). Existe un gemelo en SQL, `calcular_categoria_feb()` (migración v18) — mantener ambos sincronizados si cambian los rangos.
- Roles: `superadmin`, `owner`, `coach`, `atleta`, `padre`.
- Las migraciones de base de datos están numeradas y son aditivas (`ALTER TABLE ... IF NOT EXISTS`). Agregar un nuevo `supabase_migration_vN_*.sql` en lugar de editar uno ya aplicado. Última: v18 (comunicaciones segmentadas + eventos deportivos).

## Secretos

- Nunca poner claves en el código. Las credenciales de Supabase vienen de variables de entorno (`VITE_SUPABASE_*`). Los archivos `.env*` están en `.gitignore` — no commitearlos.

## Problemas conocidos / detalles a tener en cuenta

- **El repo ya no vive en OneDrive** (vive en `~/dev/BlackGoldAPP`). Sigue pudiendo aparecer un `index.lock` stale en `.git` cuando git se ejecuta desde herramientas en sandbox; si no hay ningún proceso git corriendo, es seguro borrar ese archivo y reintentar.
- Los scripts operativos de un solo uso viven en `Dashboard_Premium/scripts/` (no en la raíz de `Dashboard_Premium/`), leen credenciales solo de `.env` (nunca hardcodeadas) y varios escriben/borran datos reales — revisar cada uno antes de ejecutarlo, especialmente `limpiar_base_datos.js`.
- No existía una tabla de pertenencia atleta↔grupo de entrenamiento; la migración v18 agrega `atleta_grupo`. Debe poblarse para que funcionen las funciones basadas en grupos.

## Documentos de diseño

- `docs/comunicaciones_eventos.md` — diseño de las comunicaciones segmentadas y el módulo de eventos deportivos (convocatorias/RSVP, recordatorios, resultados), más la capacidad futura de campeonatos + planilla de juego digital. Acompaña a la migración v18.
