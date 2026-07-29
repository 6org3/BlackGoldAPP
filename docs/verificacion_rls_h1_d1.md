# Verificación de RLS por tabla — prerrequisito H1-D1

**Fecha:** 2026-07-29 · **Estado:** ✅ **H1-D1 CERRADO** para las tablas de su alcance.
**Qué exigía H1-D1** (`docs/spec_h1_autonomia_resultados.md`): un documento por tabla que un agente H1 escribe o lee de forma sensible, respondiendo *qué policy aplica hoy, con qué helper y con qué filtro por club* — y cerrando la contradicción entre `pendientes_post_beta.md` §1 (que daba RLS por permisiva) y v24 (que la daba por real). Sin ese cierre no se enciende ninguna escritura autónoma.

Este documento **no** ratifica las features F1/F2/F3, que siguen pendientes de decisiones del owner. Solo levanta el bloqueo técnico.

## Método: dos piernas, porque una sola no alcanza

| | Qué prueba | Qué NO prueba |
|---|---|---|
| **Declarativa** — reconstruir el estado final aplicando las migraciones en orden | Qué policy existe, con qué helper y qué filtro | Que nadie haya tocado producción a mano por fuera de las migraciones |
| **Conductual** — abrir sesiones de Auth reales por rol contra producción e intentar leer/escribir | Que el bloqueo ocurre de verdad, venga de donde venga | Por qué ocurre (no nombra la policy) |

La pierna declarativa vale **solo porque su premisa está verificada**: `npx supabase migration list` da **59/59 en paridad exacta** (ninguna migración aplicada sin archivo local, ninguna local sin aplicar). Es decir, producción es exactamente la suma de las migraciones del repo, y los `.sql` son fuente válida. La pierna conductual cubre el hueco restante (cambios a mano vía el editor SQL del dashboard, que ninguna paridad de migraciones detecta).

**Lo que no se pudo hacer y por qué:** leer el catálogo vivo (`pg_policies`) habría sido la evidencia más directa. No fue posible — `supabase db dump` exige Docker (no disponible), la URL del pooler no trae contraseña, y no hay `psql` ni RPC de introspección en el proyecto. PostgREST no expone `pg_catalog`. Se descartó pedir la contraseña de la base. La combinación paridad-59/59 + verificación conductual cubre el mismo terreno con evidencia distinta.

## Veredicto por tabla

Helpers en juego, todos `SECURITY DEFINER` (v24, endurecidos en v35/v52): `es_superadmin()`, `es_staff()`, `es_owner_activo()` (v52), `current_user_club()`, `current_usuario_id()`, `mis_atletas()`, `club_de_atleta()` (v29), `club_de_pago()` (v40). Todas las policies son `TO authenticated`: **anon no alcanza ninguna de estas tablas**.

### Tablas que un agente H1 ESCRIBIRÍA

#### `progreso_misiones` — RLS activa, 3 policies
| Policy | Cmd | Filtro |
|---|---|---|
| `progreso_select_propio` | SELECT | `atleta_id IN mis_atletas()` |
| `progreso_update_atleta` | UPDATE | `current_user_rol() = 'atleta' AND atleta_id IN mis_atletas()` |
| `progreso_staff` (v53) | ALL | `es_superadmin() OR (es_staff() AND club_de_atleta(atleta_id) = current_user_club())` |

**Aislamiento por club: sí**, vía `club_de_atleta()`. El atleta **no tiene policy de INSERT**: su única escritura es el UPDATE de su propio progreso, así que no puede auto-asignarse misiones ni auto-otorgarse XP. Verificado conductualmente.

#### `comunicaciones` — RLS activa, 2 policies
| Policy | Cmd | Filtro |
|---|---|---|
| `comunicaciones_staff` (v29) | ALL | `es_superadmin() OR (es_staff() AND (autor_id IS NULL OR club_de_usuario(autor_id) = current_user_club()))` |
| `comunicaciones_select_audiencia` (v44) | SELECT | segmento/autor del propio club, o dirigida al atleta |

**Aislamiento por club: sí** (v44 cerró una fuga de lectura cross-club encontrada por sonda el 2026-07-22).

#### `misiones` (catálogo) — RLS activa, 4 policies
| Policy | Cmd | Filtro |
|---|---|---|
| `misiones_select` | SELECT | `true` |
| `misiones_write` / `misiones_update` | INSERT/UPDATE | `es_staff()` |
| `misiones_delete` (v53) | DELETE | superadmin, o staff del club dueño de la misión |

**Aislamiento por club: parcial y deliberado.** La lectura del catálogo es global (`USING (true)`) porque el catálogo es conocimiento compartido del club, no dato personal. La escritura sí exige `es_staff()`, y v53 acotó el DELETE al club autor. Queda asentado como **decisión verificada, no como hallazgo**.

### Tablas de LECTURA sensible

`pagos` (5 policies), `pago_transacciones` (5), `pago_comprobantes` (6) — todas con RLS activa. Patrón común tras **v52**: lectura para staff del club (`es_staff()` + `club_de_pago()`/`club_de_atleta()`), escritura restringida a **owner activo** (`es_owner_activo()`), y lectura propia para la familia vía `mis_atletas()`. `pago_transacciones` además fuerza `registrado_por = current_usuario_id()` en el INSERT: no se puede registrar un cobro a nombre de otro.

**Aislamiento por club: sí en las tres.**

### Las 4 tablas que `pendientes_post_beta.md` §1 acusaba

El §1 (2026-07-04) decía que 4 tablas de v18 seguían con `FOR ALL USING (true)`. **Ya no es cierto**: v24 borró en bloque todas las policies del esquema y las recreó.

| Tabla | Hoy |
|---|---|
| `eventos` | 2 policies; staff acotado por `club`, convocado ve solo eventos publicados a los que fue convocado |
| `evento_convocados` | 3 policies; atleta ve/RSVP lo suyo, staff acotado por el club del evento |
| `evento_recordatorios` | 1 policy; staff acotado por el club del evento |
| `atleta_grupo` | 2 policies; ambas por `club_de_atleta()` |

Ninguna conserva `USING (true)`. **La contradicción queda resuelta a favor de v24.**

## Dos apuntes sobre la documentación

**1. `pagos_staff` — confirmación independiente.** Esta verificación llegó por su cuenta a la misma conclusión que la auditoría pre-producción del 2026-07-29 ya había asentado en `CLAUDE.md`: **no existe ninguna tabla `pagos_staff`** (cero `CREATE TABLE` en las 59 migraciones); era el **nombre de una policy** sobre `public.pagos`, con aislamiento por club desde v29. Se deja constancia porque el hallazgo se derivó por otra vía (reconstrucción del estado final) y **coincide**, lo que refuerza ambas: no hay tal deuda. Detalle adicional que aporta esta verificación: v52 la reemplazó por `pagos_staff_select` (SELECT) más policies de escritura solo-owner, o sea que además de scopeada quedó más restringida.

**2. `pendientes_post_beta.md` §1 nunca nombró las 4 tablas.** Solo enumeraba 8 tablas base. Las 4 con `FOR ALL USING (true)` hay que deducirlas de v18 (`eventos`, `evento_convocados`, `evento_recordatorios`, `atleta_grupo`) — quedan nombradas arriba para que la próxima verificación no tenga que redescubrirlas.

## El hueco que esta verificación encontró y cerró

La suite `npm run test:rls` cubría a fondo las tablas de **lectura** sensible (`pagos`, `pago_transacciones`, `pago_comprobantes`: 19 referencias entre las tres) y tenía **cero asserts** sobre las tres de **escritura** (`progreso_misiones`, `comunicaciones`, `misiones`) — precisamente las que F1 y F2 mutarían. La verificación declarativa decía que estaban bien; nadie lo había comprobado nunca contra la base.

Se añadió la suite `suiteTablasEscrituraH1` con **12 asserts**, todos en verde:

- atleta **no** se auto-asigna una misión (el vector de auto-otorgarse XP);
- coach **sí** asigna dentro de su club, **no** a un atleta de otro club;
- atleta lee su progreso, **no** el de otro; coach **no** lee el de otro club; anon no ve nada;
- atleta **no** redacta comunicaciones; coach sí en su club, y **no** firmando como usuario de otro club;
- atleta **no** agrega ni borra misiones del catálogo (ni con XP inflado); sí lo lee (global a propósito).

**Resultado de la corrida completa contra producción: 124/124 asserts en verde.**

Se corrigieron además dos defectos de la propia suite, descubiertos al ampliarla:

- `comunicaciones.autor_id` es FK a `usuarios` sin CASCADE: una comunicación QA bloqueaba el borrado de **todos** los usuarios QA al limpiar. Se borra explícitamente antes, como ya se hacía con los pagos.
- Desde **v54** (control de abuso del registro público, mergeado hoy) la suite dejó de ser repetible dentro de una hora: la segunda corrida recibe HTTP 429 y arrastraba en cascada las suites dependientes. Ahora ese 429 se reporta como **omitida** con aviso, no como rojo — es el limitador funcionando, no un fallo de RLS. **Consecuencia para quien lea un resultado:** una corrida con las suites de registro omitidas no valida esas dos; para validarlas hace falta una ventana de una hora limpia.

## Qué queda fuera de este cierre

- **`cola_recordatorios`** (tabla nueva de F3) no existe todavía: se verificará cuando se cree.
- **La sonda cross-club de 5 clubes** (`tmp_probe_rls_5clubes.mjs`, la que encontró la fuga de v44) **no pudo correr**: sus credenciales (`QA_*_PASSWORD` / `credenciales_5clubes.json`) ya no existen en el entorno. La dimensión cross-club igual quedó cubierta por la suite principal, que levanta su propio "QA Club Ajeno" con datos reales que atacar.
- **Riesgo residual:** un cambio hecho a mano en el editor SQL del dashboard que aflojara una policy no lo detecta la paridad de migraciones. Lo detectaría la pierna conductual solo si cae dentro de los 124 asserts. Mitigación: correr `npm run test:rls` antes de encender cualquier flag de autonomía, no solo una vez hoy.

## Cómo repetir esta verificación

```bash
npx supabase migration list
```

```bash
npm run test:rls
```

El primero debe dar paridad total (ninguna fila con `local` o `remote` vacío). El segundo, todos los asserts en verde; si las suites de registro aparecen omitidas, esperar a que venza la ventana de una hora de v54 y repetir para validarlas.
