---
name: zettelkasten
description: Atomizar, conectar y mantener notas empresariales con metadatos válidos.
---

# zettelkasten

## Propósito

Atomizar, conectar y mantener notas empresariales con metadatos válidos.

## Agentes autorizados

shaka

## Clasificación máxima

interno

## Reglas obligatorias

- Conservar source_id al actualizar exportaciones y evitar duplicados semánticos.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.