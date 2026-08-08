---
name: hyperframes
description: Convierte un HTML (design system Black Gold) en un video MP4 vertical usando HyperFrames de HeyGen.
---

# hyperframes — HTML a video MP4 con Black Gold

## Cuándo usarla
Cuando **edison** entrega una composición **HTML** (con el design system **Black Gold**) y hay que **renderizarla a un MP4 vertical** para reel/story. "Video as code": el HTML *es* el video. Rol principal: **atlas** (render/media).

## Configuración
HyperFrames vive en `~/tools/hyperframes` (git clone + `npm install`, ver `instalar-herramientas.sh`). Requiere **Node.js 22+** y **FFmpeg**.

## Comandos exactos (copy-paste)

### Flujo con proyecto HyperFrames (init → preview → render)
```bash
cd ~/tools/hyperframes
# 1) Crear un proyecto de video (una vez por pieza):
npx hyperframes init reel-blackgold
cd reel-blackgold
# 2) Reemplaza el index.html por el HTML de Edison (composición Black Gold).
#    La resolución/formato se controla en el HTML con data-width / data-height:
#      <div class="composition" data-width="1080" data-height="1920"> ... </div>
# 3) Previsualizar en el navegador (opcional):
npx hyperframes preview
# 4) Renderizar a MP4:
npx hyperframes render
```
El MP4 queda en la carpeta de salida del proyecto (revisa la consola por la ruta exacta).  # VERIFICAR nombre/carpeta de salida y flags de resolución en tu versión

### Vertical 9:16
Se logra poniendo `data-width="1080" data-height="1920"` en el elemento de composición del HTML de Edison, no con un flag de CLI.

## Ejemplo de uso típico por rol
**edison** produce `promo.html` con el layout Black Gold (tipografía, colores, animaciones). **atlas** lo mete como `index.html` en un proyecto HyperFrames, corre `npx hyperframes render` y entrega `promo.mp4` vertical a Jorge para aprobación.

## Manejo de errores
- Si `npx hyperframes` no existe o falla, la instalación no está completa: verifica `node -v` (≥22) y que se hizo `npm install` en `~/tools/hyperframes`. Reporta a Jorge.
- Si el render falla por FFmpeg, confirma que la skill **ffmpeg** esté instalada.
- Si el HTML se ve roto en `preview`, el problema está en el HTML de Edison: **devuélveselo con el detalle**, no fuerces un render feo.
- Ante error que no entiendas, copia el log y **repórtalo a Jorge**.

## Regla de curaduría
El MP4 es un entregable local. **No se publica en ninguna red ni se manda a cliente sin OK explícito de Jorge.**
