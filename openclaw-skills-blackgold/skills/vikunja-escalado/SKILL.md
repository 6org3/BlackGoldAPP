---
name: vikunja-escalado
description: Crear tareas financieras escaladas sin información identificable.
---

# vikunja-escalado

## Propósito

Crear tareas financieras escaladas sin información identificable.

## Agentes autorizados

pythagoras

## Clasificación máxima

interno

## Reglas obligatorias

- Usar referencias opacas; ningún documento, nombre o cuenta en Vikunja.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.