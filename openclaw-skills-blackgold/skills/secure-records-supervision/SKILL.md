---
name: secure-records-supervision
description: Solicitar acceso justificado a documentos cifrados mediante la API segura.
---

# secure-records-supervision

## Propósito

Solicitar acceso justificado a documentos cifrados mediante la API segura.

## Agentes autorizados

vegapunk

## Clasificación máxima

restringido

## Reglas obligatorias

- Nunca enumerar el bucket ni montar archivos. Cada lectura requiere purpose y deja auditoría.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.