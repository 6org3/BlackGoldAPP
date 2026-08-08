# Sistem OS control plane

Proyección local, de solo lectura, de las fuentes canónicas de Sistem OS. No controla servicios, no envía mensajes, no reintenta y no recibe PII, prompts, secretos o identificadores de personas/sesiones.

## Ejecutar Bloque B

```powershell
cd C:\Users\jorge\dev\BlackGoldAPP\sistem-os-control-plane
npm run all -- --vault-root "C:\Users\jorge\Seg Cerebro\Segundo Cerebro 6orge3" --repo-root "C:\Users\jorge\dev\BlackGoldAPP"
```

El comando exige ambas raíces declaradas. Registra únicamente `root_id`, ruta relativa y SHA-256; excluye de forma explícita `.git`, `.obsidian`, `.trash`, `node_modules` y sus propios informes generados. No excluye `tmp`: las copias de staging y temporales aparecen como ocurrencias no autoritativas.

Salidas:

- `reports/source-manifest.v1.json`, reconciliación y validación dentro de este paquete (generados, no versionados).
- `Áreas/Sistem OS/Mapa Visual de Sistem OS.md` y `.canvas`.
- `Áreas/Sistem OS/Catálogo Visual de Workflows.md`.
- `Áreas/Sistem OS/Deriva de Sistem OS.md`.

Las notas generadas usan UTF-8 sin BOM y LF, traen `tipo: generado`, `autoridad: derivada`, `fecha_fuentes` e `input_digest`. Los enlaces se emiten en ruta canónica completa, por ejemplo `[[Áreas/Sistem OS/Estado Operativo|Estado Operativo]]`.

## Contratos

- `source-manifest.v1`: ocurrencias, artefactos por hash, clasificación, rechazos y enlace-index.
- `agent-registry.v1`: entidades, fronteras, relaciones, niveles A–D, claims y freshness.

El validador no vuelve a recorrer el vault: trabaja sobre registro y manifiesto ya recogido. Bloquea campos sensibles, IDs duplicados, relaciones rotas y estados runtime activos sin observación; además informa contradicciones y ocurrencias de workflow no registradas.

## Verificar

```powershell
npm run test:coverage
```

La suite usa `node:test` y exige 100 % de líneas, funciones y ramas.

## Puertas intactas

A1 sigue siendo una caracterización de servidor estrictamente read-only: no se escribe evidencia OpenWA hasta observar las nueve comprobaciones saneadas y confirmar que no haya doble entregador. A2 permanece bloqueado por API/rol CRM acotado y runbook de corte. C1/C3 no se implementan ni despliegan: requieren primero la puerta de producción y la prueba de utilidad del mapa B.
