---
name: stirling
description: Manipula PDFs (unir, OCR, comprimir) llamando a la API local de Stirling PDF con curl.
---

# stirling — operaciones con PDF vía API local

## Cuándo usarla
Cuando Atlas deba **unir, hacer OCR o comprimir** documentos públicos o internos no identificables aprobados para producción. No se usa con CRM, contratos, facturas ni documentos del almacén PII.

## Configuración
Stirling PDF corre en Docker en `http://localhost:8082`. Las operaciones son endpoints REST que reciben archivos con `-F` (multipart). La UI web también está en esa URL.

> Los nombres exactos de endpoint dependen de la versión de Stirling. Si un curl da 404, abre `http://localhost:8082/swagger-ui/index.html` para ver las rutas vigentes.  # VERIFICAR endpoints en tu versión

## Comandos exactos (copy-paste)

### Unir varios PDF en uno
```bash
curl -s -X POST "http://localhost:8082/api/v1/general/merge-pdfs" \
  -F "fileInput=@factura1.pdf" \
  -F "fileInput=@factura2.pdf" \
  -o unido.pdf
```

### OCR (hacer buscable un PDF escaneado, español)
```bash
curl -s -X POST "http://localhost:8082/api/v1/misc/ocr-pdf" \
  -F "fileInput=@contrato_escaneado.pdf" \
  -F "languages=spa" \
  -o contrato_ocr.pdf
```

### Comprimir un PDF pesado
```bash
curl -s -X POST "http://localhost:8082/api/v1/misc/compress-pdf" \
  -F "fileInput=@contrato.pdf" \
  -F "optimizeLevel=3" \
  -o contrato_comprimido.pdf
```

### Comprobar que el servicio responde
```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8082/"
```

## Ejemplo de uso típico por rol
**Atlas** comprime una guía metodológica pública aprobada para distribuirla como material de contenido. Los documentos financieros o identificables permanecen en el servicio cifrado y no se entregan a Stirling.

## Manejo de errores
- Si un curl da `404`, el nombre del endpoint cambió en tu versión: consulta el Swagger en `http://localhost:8082/swagger-ui/index.html` y **repórtale a Jorge la ruta correcta**.
- Si no responde nada / `Connection refused`, el contenedor está caído. Repórtalo a Jorge; no reinicies Docker por tu cuenta.
- Si el OCR no reconoce texto, verifica el idioma (`languages=spa`) y que el PDF sea legible. No entregues un OCR vacío como bueno.

## Regla de curaduría
Los PDF resultantes son archivos internos. **Enviar una factura, contrato o documento a un cliente/proveedor requiere OK explícito de Jorge.**
