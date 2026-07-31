# Edge Functions

Seis funciones Deno desplegadas en Supabase. Todas corren con la `service_role`
key, que **salta toda la RLS**: el control de acceso lo hace la función, no la
base. Por eso el patrón de autenticación de `_shared/brainAuth.ts` no es
opcional (ver abajo).

| Función | Autenticación | Qué hace |
|---|---|---|
| `brain-gateway` | `autenticar()` + alcance | Diagnóstico de pilares y readiness en JSON |
| `actualizar-correo` | `autenticar()`, sujeto del JWT | Cambia el correo propio en `usuarios` **y** en Auth, a la vez |
| `cambiar-password` | `autenticar()`, sujeto del JWT | Cambia la contraseña propia y apaga `debe_cambiar_password` |
| `copiloto` | `autenticar()` + alcance por tool | Asistente conversacional; cuota diaria por usuario (`consumir_cuota_copiloto`, 30/día, ajustable con `COPILOTO_LIMITE_DIA` sin redesplegar) |
| `crear-acceso-usuario` | `autenticar()` + staff | Emite o rota credenciales de un usuario |
| `generar-misiones-ia` | `autenticar()` + alcance | Genera y asigna misiones según debilidades; la IA de último recurso para debilidades sin cobertura usa DeepSeek (`DEEPSEEK_API_KEY`; antes Gemini) |
| `purgar-usuario-rechazado` | `autenticar()` + superadmin | Libera la cédula de un registro rechazado |
| `registro-publico` | **ninguna, a propósito** | Alta pública desde `/registro` |

## Desplegar

```bash
npm run functions:deploy            # TODAS las funciones
npm run functions:deploy -- copiloto  # solo una
```

**`functions:deploy` despliega todas a propósito.** Antes tenía el nombre de una
función incrustado y desplegaba solo `generar-misiones-ia`: quien tocaba tres
funciones y corría el comando documentado subía una y se quedaba creyendo que
había terminado. Eso pasó de verdad en la auditoría del 2026-07-29, con una
corrección de seguridad entre las que se quedaron sin subir.

Desplegar de más es barato (subir código idéntico es un no-op); desplegar de
menos deja una corrección a medias sin que nada lo diga. Por eso el default es
el seguro y la vía rápida es explícita.

`functions:sync` corre siempre antes: copia `packages/analytics-core` y
`packages/brain-core` dentro de `_shared/`, porque una Edge Function no puede
importar desde fuera de su propio directorio.

## Proveedor del copiloto

`copiloto` habla dos dialectos: el nativo de Anthropic (Messages API) y el
OpenAI-compatible (`/chat/completions`), que sirve para DeepSeek y cualquier
proveedor con esa misma forma. Se elige con cuatro variables de entorno, en los
secrets de la función:

| Variable | Default | Qué hace |
|---|---|---|
| `COPILOTO_FORMATO` | `anthropic` | `anthropic` u `openai`. Un valor desconocido cae en `anthropic` |
| `COPILOTO_API_KEY` | — | Clave del proveedor. Si falta y el formato es `anthropic`, usa `ANTHROPIC_API_KEY` |
| `COPILOTO_BASE_URL` | según formato | `https://api.anthropic.com/v1/messages` · `https://api.deepseek.com/chat/completions` |
| `COPILOTO_MODEL` | según formato | `claude-haiku-4-5` · `deepseek-chat` |

Sin ninguna de las cuatro, la función se comporta exactamente como antes:
Anthropic con `ANTHROPIC_API_KEY`. Sin clave por ninguna vía devuelve 503.

Para DeepSeek bastan dos variables, porque los defaults del formato `openai` ya
apuntan ahí:

```
COPILOTO_FORMATO=openai
COPILOTO_API_KEY=sk-...
```

**Quédate en `deepseek-chat`.** `deepseek-reasoner` no soporta function calling,
y aquí todo el valor sale de las tools (rack documental, diagnóstico,
readiness): sin ellas el copiloto solo puede inventar.

### Antes de cambiar de proveedor

El hilo que sale de aquí lleva **datos de menores**: nombres, evaluaciones
físicas, sueño y fatiga. Viaja íntegro al proveedor que se configure.

Anthropic no entrena con datos de API por defecto. DeepSeek procesa en China y
varios proveedores OpenAI-compatible sí entrenan con el tráfico de su API —
conviene leer sus términos antes, no después. La elección de proveedor es
decisión del dueño del club; esta función solo la ejecuta.

## Autenticación: por qué `brainAuth` no es opcional

`_shared/brainAuth.ts` expone `autenticar()`, `obtenerAtleta()` y
`fueraDeAlcance()`. El orden importa: `autenticar()` valida el JWT con el
cliente **anon** y solo después crea el cliente `service_role`, comprueba que la
cuenta esté activa, y `fueraDeAlcance()` acota por rol (owner solo su club,
coach club + categoría, atleta solo a sí mismo, padre solo a sus hijos).

Saltarse ese bloque no deja la función "menos protegida": la deja **sin ninguna
protección**, porque `service_role` ignora la RLS. `generar-misiones-ia` estuvo
así y devolvía el perfil físico y las alertas de sueño y fatiga de cualquier
menor a quien pidiera, con solo la anon key.

Y `verify_jwt` (activo por defecto) **no sustituye a esto**: solo exige un JWT
firmado por el proyecto, y la anon key pública lo satisface — va en el bundle
del cliente. Sirve para frenar ruido, no para autorizar.

La excepción es `registro-publico`, que no autentica porque es el formulario de
inscripción; a cambio no expone ningún dato ajeno y delega en la RPC
`registrar_publico()`, que fuerza rol y estado server-side.

## Errores

El detalle de Postgres, PostgREST o GoTrue va al **log**, nunca a la respuesta:
esos textos delatan nombres de tabla, columnas y políticas. Al cliente le llega
algo accionable en español.

Excepción deliberada: los `RAISE EXCEPTION` de nuestro propio PL/pgSQL llegan con
código `P0001` y son validaciones de negocio escritas para el usuario ("solo se
pueden purgar usuarios rechazados"), así que esas sí se muestran. El criterio
está implementado en `purgar-usuario-rechazado`.
