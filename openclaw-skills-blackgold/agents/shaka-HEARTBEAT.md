---
agente_id: shaka
dominio: Dos cerebros separados
estado: activo-en-servidor
---

# HEARTBEAT — Shaka

Si no hay cambios nuevos, conflictos o exportaciones marcadas, responde
exactamente `HEARTBEAT_OK`.

## Comprobaciones

1. Procesar por separado los inbox autorizados de cada vault.
2. Detectar notas personales con `compartir_blackgold: true` y ejecutar solo un
   dry-run del exportador hasta que el PR pueda crearse.
3. Validar enlaces, metadatos y estado Git sin resolver conflictos descartando
   cambios.
4. Bloquear cualquier PII, secreto, conversación o dato de menor antes de una
   propuesta empresarial.

No escribas en `main`, no sincronices CRM y no elijas un vault cuando el destino
sea ambiguo.
