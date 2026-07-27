# CI de BlackGoldAPP

Este directorio contiene el pipeline de integración continua (`ci.yml`), montado el
2026-07-26. Antes de esto el único gate automático del repo era el preview deploy de
Vercel por Pull Request; este workflow añade una verificación de código antes de llegar
a ese preview.

## Qué hace

Un solo job (`dashboard`) que corre en cada `push` a `main`, en cada Pull Request contra
`main`, y a mano desde la pestaña **Actions → CI → Run workflow**:

1. Descarga el código y instala Node 22.
2. `npm ci` dentro de `Dashboard_Premium/` (instalación limpia desde `package-lock.json`).
3. `npm run lint` — **informativo, no bloquea el pipeline** (ver más abajo por qué).
4. `npm test` (= `vitest run`, sin watch) — los 21 specs de Vitest bajo `src/`.
5. `npm run build` (= `vite build`) — build de producción real, el mismo que usa Vercel.

Las variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` que ves en el workflow son
**valores de relleno inventados**, no secretos reales. Están ahí solo para que
`createClient(url, key)` no reciba `undefined` al hacer el build. Los tests de Vitest ya
mockean el cliente de Supabase donde hace falta (`vi.mock('.../supabaseClient', ...)`),
así que no necesitan ninguna variable de entorno real para pasar.

## Cómo leer un fallo

- **Falla el paso de tests o de build → el PR tiene un problema real**, revisar el log de
  ese paso en la pestaña "Checks" del PR o en Actions.
- **Falla (o sale en amarillo) el paso de lint → normalmente NO es cosa tuya.** El repo ya
  tenía ~163 problemas de lint antes de este CI (153 errores, 10 warnings, ninguno
  relacionado con este cambio de infraestructura). El paso está marcado
  `continue-on-error: true` a propósito para no bloquear PRs por deuda vieja. Cuando se
  limpie ese lint, quitar esa línea en `ci.yml` para que el lint sí bloquee.
- Si el job entero falla en el paso de `npm ci` casi seguro es un problema de red de
  GitHub Actions o del propio `package-lock.json`, no del código del PR.

## Qué falta (siguiente paso, no incluido en esta primera versión)

- **Cypress (e2e):** las 14 specs en `Dashboard_Premium/cypress/e2e/*.cy.js` no están en
  este CI. Necesitan un servidor corriendo, una base de datos Supabase real y
  credenciales (ver `cypress.env.json.example`), y son mucho más lentas que Vitest.
  Meterlas de entrada habría hecho el CI inestable e intermitente desde el día uno. El
  hueco queda comentado en `ci.yml` con un esqueleto de job listo para activar en cuanto
  haya un proyecto Supabase de pruebas dedicado.
- **`blackgold-mcp/`:** no tiene ningún job de CI. Su `package.json` no define ningún
  script de test (solo `start`, `inspector`, `rack`), así que no hay nada que correr
  todavía. Agregar un job cuando ese paquete tenga tests reales.
- **Versión de Node:** el repo no fija `engines` en `package.json` ni tiene `.nvmrc`. El
  workflow usa Node 22 porque es la versión con la que se verificó localmente y cubre de
  sobra lo que exige Vite 8. Si en algún momento se agrega un `.nvmrc`, hay que
  actualizar `ci.yml` para que coincida.
