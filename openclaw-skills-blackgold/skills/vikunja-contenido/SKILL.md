---
name: vikunja-contenido
description: Gestionar tareas de contenido en el proyecto autorizado de Vikunja.
---

# vikunja-contenido

## Propósito

Gestionar tareas de contenido en el proyecto autorizado de Vikunja.

## Agentes autorizados

edison

## Clasificación máxima

interno

## Reglas obligatorias

- No incluir PII ni conversaciones de clientes en títulos, descripciones o comentarios.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.