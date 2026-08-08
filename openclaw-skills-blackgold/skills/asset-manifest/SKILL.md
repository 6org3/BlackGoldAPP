---
name: asset-manifest
description: Resolver asset_id y registrar derivados aprobados sin guardar binarios grandes en Git.
---

# asset-manifest

## Propósito

Resolver asset_id y registrar derivados aprobados sin guardar binarios grandes en Git.

## Agentes autorizados

atlas

## Clasificación máxima

publico, interno

## Reglas obligatorias

- No acceder al almacén PII. Solo usar activos aprobados y respetar licencias.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.