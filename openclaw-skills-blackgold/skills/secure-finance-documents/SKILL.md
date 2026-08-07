---
name: secure-finance-documents
description: Leer documentos financieros cifrados expresamente autorizados.
---

# secure-finance-documents

## Propósito

Leer documentos financieros cifrados expresamente autorizados.

## Agentes autorizados

pythagoras

## Clasificación máxima

restringido

## Reglas obligatorias

- Requiere secure_document_id, purpose y autorización de tipo financiero; no puede enumerar el almacén.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.