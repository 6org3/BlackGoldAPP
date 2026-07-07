# Flujo de desarrollo — Black Gold

`main` está **protegida** y **auto-despliega a producción** (Vercel). Por eso el trabajo
no se commitea directo a `main`: va por rama → Pull Request → preview → merge. Así cada
cambio tiene un preview deployment antes de tocar producción y queda un registro revisable.

## El ciclo

```bash
git switch main && git pull            # partir de main al día
git switch -c feat/mi-cambio           # rama por cambio
# … editar, commitear …
git push -u origin feat/mi-cambio      # subir la rama
gh pr create --fill                    # abrir el PR (o el botón en GitHub)
```

- **Preview automático:** Vercel publica un deployment por PR. El enlace aparece como check
  en el PR — ábrelo y verifica el cambio ahí antes de mergear (nunca directo en producción).
- **Merge:** con el preview validado, mergea desde GitHub (o `gh pr merge --squash`). La rama
  se borra sola (`delete_branch_on_merge`) y `main` despliega a producción en minutos.
- **Squash** es el merge preferido: un commit por PR mantiene el historial de `main` legible.

## Convención de ramas

`<tipo>/<descripcion-corta>` — `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`.
Mismos prefijos que los mensajes de commit del repo (`feat(seguridad): …`).

## Protección de `main` (estado actual)

Configurada como **guardarraíl gradual** (2026-07-07):

| Regla | Estado |
|---|---|
| Force-push a `main` | ❌ bloqueado |
| Borrado de `main` | ❌ bloqueado |
| PR obligatorio | ✅ (0 approvals requeridos — puedes auto-mergear trabajando solo) |
| Resolución de conversaciones | ✅ requerida |
| `enforce_admins` | ⬜ **desactivado** — como admin todavía puedes pushear directo a `main` |

`enforce_admins` está en `false` a propósito, para no romper trabajo en vuelo durante la
transición. **Cuando el equipo esté rodado en el flujo**, subir a estricto (te obliga a ti
también a usar PR) con:

```bash
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/6org3/BlackGoldAPP/branches/main/protection/enforce_admins
```

(volver a guardarraíl: el mismo endpoint con `-X DELETE`.)

Cuando entren 2+ personas, subir además `required_approving_review_count` a `1` desde
Settings → Branches, y considerar marcar el check de Vercel como *required status check*.

## Antes de abrir el PR

- Migraciones de base de datos: archivo nuevo en `Dashboard_Premium/supabase/migrations/`
  (aditivas, timestamp nuevo) — nunca editar una ya aplicada. Ver [CLAUDE.md](CLAUDE.md).
- Cambios de RLS/roles: correr `node Dashboard_Premium/scripts/validar_rls_por_rol.js`
  (suite de 25 asserts contra la base) y adjuntar el resultado al PR.
- Nada de secretos en el código: las claves viven en `.env*` (gitignored). Ver CLAUDE.md § Secretos.
- `gh` persistente en tu terminal: `gh auth login` una vez (GitHub.com → HTTPS → navegador)
  — el token guardado por `git push` no trae el scope `read:org` que pide el login de `gh`.
