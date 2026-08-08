# Skills de Black Gold para OpenClaw

Paquete de skills con acceso por rol para OpenClaw 2026.7.1-2. El archivo
`skills-manifest.json` registra versión, checksum, agente autorizado y
clasificación de cada skill.

La skill histórica `inbox` queda retirada. Los contactos, presupuestos,
conversaciones y preferencias de leads viven exclusivamente en el CRM, nunca
en Obsidian, Git, Vikunja o logs. Shaka es el único agente que trabaja en ambos
vaults y siempre debe indicar el destino.

## Instalación

1. Instalar las herramientas multimedia y de investigación necesarias con
   `sh instalar-herramientas.sh`.
2. Configurar las credenciales mínimas de cada servicio fuera del repositorio.
3. Ejecutar `sh repartir-skills.sh`.
4. Ejecutar `openclaw doctor` y reiniciar el gateway correspondiente.

El reparto es una allowlist física: antes de copiar elimina las skills
gestionadas anteriormente y la skill revocada `inbox`. No modifica
`agents.list[].skills`; si esa allowlist se configura en OpenClaw, debe coincidir
con este manifiesto.

## Acceso por agente

| Agente | Rol | Acceso |
|---|---|---|
| Vegapunk | Asistente personal de Jorge y supervisor de Black Gold | Conocimiento empresarial completo, Dirección, auditoría CRM, documentos seguros justificados e infraestructura |
| Shaka | Curador de ambos cerebros | Vault personal, vault Black Gold, exportación sanitizada, filtro PII, enlaces y Git seguro |
| Edison | Marketing y Content OS | Investigación web de solo lectura, marca, conocimiento agregado y tareas de contenido |
| Atlas | Producción multimedia | Herramientas de medios, worker de la PC y manifiesto de activos aprobados |
| Lily (`lilith`) | Atención y ventas Black Gold | Base pública, contacto CRM actual, consentimiento, handoff y resúmenes agregados |
| Pythagoras | Finanzas Black Gold | Lectura financiera, conciliación, documentos financieros autorizados y reportes |

## Límites obligatorios

- `main` del vault empresarial es fuente aprobada y de solo lectura para agentes.
- Todo cambio empresarial se propone en rama y pull request.
- Lily solo recibe la vista de conocimiento `publico` y el `contact_id` actual.
- No se indexa PII en RAG, embeddings, n8n ni los vaults.
- Un documento seguro se solicita por `secure_document_id` y propósito; no se
  puede enumerar ni montar el bucket.
- Atlas deriva renders pesados al worker autorizado de la PC RTX 4060.
- Miami no forma parte del alcance de Lily, Pythagoras o los heartbeats de
  Black Gold.

## Herramientas heredadas

`ffmpeg`, `rembg`, `ytdlp`, `tts`, `hyperframes`, `stirling`, `crawl4ai` y
`vikunja` siguen disponibles únicamente para los agentes indicados por
`repartir-skills.sh`. `browseruse` se sustituye por la política
`browser-readonly`.
