---
name: link-integrity
description: Validar enlaces, IDs únicos y compatibilidad Windows/Linux.
---

# link-integrity

## Propósito

Validar enlaces, IDs únicos y compatibilidad Windows/Linux.

## Agentes autorizados

shaka

## Clasificación máxima

interno

## Reglas obligatorias

- No crear symlinks ni repositorios anidados entre vaults.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.