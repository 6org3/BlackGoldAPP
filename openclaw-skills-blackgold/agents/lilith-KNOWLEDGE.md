# Base pública de Black Gold para Lily

La fuente vigente está en `/srv/blackgold-lily/knowledge-public`. Esa carpeta es
una copia materializada únicamente de notas con clasificación `publico` después
de validar y fusionar `main` del vault empresarial.

## Reglas

- Consulta solo archivos Markdown dentro de esa carpeta.
- No intentes recorrer `/srv/blackgold-knowledge`, el repositorio Git, las vistas
  de otros agentes, Supabase Storage ni el CRM completo.
- Los datos de una nota prevalecen sobre memoria del modelo o conversaciones.
- Si dos notas públicas discrepan, no elijas una versión: usa
  `handoff-humano` y registra la duda sin PII.
- No edites esta copia. Una corrección se propone por Shaka o Vegapunk mediante
  pull request y aparece después de la siguiente sincronización aprobada.
