---
name: finanzas-blackgold-readonly
description: Consultar finanzas empresariales autorizadas y producir reportes trazables.
---

# finanzas-blackgold-readonly

## Propósito

Consultar finanzas empresariales autorizadas y producir reportes trazables.

## Agentes autorizados

pythagoras

## Clasificación máxima

confidencial

## Reglas obligatorias

- Solo lectura. No exponer cifras individuales fuera de Dirección.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.