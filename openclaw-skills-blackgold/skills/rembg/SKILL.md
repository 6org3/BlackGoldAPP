---
name: rembg
description: Quita el fondo de activos públicos aprobados de Black Gold y genera PNG transparentes.
---

# rembg — quitar fondo de fotos de producto

## Cuándo usarla
Cuando haya que **recortar el fondo** de activos públicos aprobados para creatividades de Black Gold, como uniformes o material deportivo. Rol autorizado: **Atlas**.

## Comandos exactos (copy-paste)

### Una sola imagen
```bash
rembg i entrada.jpg salida.png
```

### Lote: toda una carpeta de entrada a una de salida
```bash
rembg p carpeta_in carpeta_out
```

### Con modelo específico (opcional; útil para ropa/objetos con detalle)
```bash
rembg i -m isnet-general-use entrada.jpg salida.png
```

## Ejemplo de uso típico por rol
**Atlas** recibe un `asset_id` aprobado de uniformes, quita el fondo en el worker de la PC y registra el derivado en el manifiesto. No procesa fotografías de clientes ni atletas identificables.

## Manejo de errores
- La **primera ejecución descarga el modelo** (~170 MB); si no hay internet o falla la descarga, repórtalo a Jorge.
- Si dice `command not found`, la skill no está instalada: avisar (se instala con `pipx install rembg` / `pip install "rembg[cli]"`).
- Si la salida sale con bordes feos, prueba `-m isnet-general-use`. Si aun así queda mal, **repórtalo a Jorge**, no entregues fotos con recorte sucio como finales.
- Nunca sobreescribas el original: siempre saca `.png` aparte.

## Regla de curaduría
rembg solo genera archivos locales. **Ninguna foto se publica ni se manda a un cliente sin OK explícito de Jorge.**
