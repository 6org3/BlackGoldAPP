---
name: ffmpeg
description: Edita video/audio por línea de comandos — transcodificar, recortar, concatenar, extraer audio y redimensionar a formatos de reel (9:16, 1:1).
---

# ffmpeg — edición de video/audio para reels y shorts

## Cuándo usarla
Cuando haya que **transcodificar, recortar, unir, extraer audio o reformatear** un video, especialmente para dejarlo listo como **reel/short vertical (9:16)** o cuadrado (1:1) para Content-OS. Rol principal: **atlas** (render/media).

## Comandos exactos (copy-paste)

### Transcodificar a MP4 H.264 (compatible con todo)
```bash
ffmpeg -i entrada.mov -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k salida.mp4
```

### Recortar un fragmento (desde 00:00:10 durante 15 s)
```bash
ffmpeg -ss 00:00:10 -i entrada.mp4 -t 15 -c copy recorte.mp4
```

### Extraer solo el audio a MP3
```bash
ffmpeg -i entrada.mp4 -vn -c:a libmp3lame -q:a 2 audio.mp3
```

### Concatenar varios clips (mismo códec)
```bash
# 1) crea lista.txt con:  file 'clip1.mp4'  /  file 'clip2.mp4' ...
printf "file 'clip1.mp4'\nfile 'clip2.mp4'\n" > lista.txt
ffmpeg -f concat -safe 0 -i lista.txt -c copy union.mp4
```

### Redimensionar/recortar a REEL vertical 9:16 (1080x1920), rellenando sin deformar
```bash
ffmpeg -i entrada.mp4 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black" -c:a copy reel_9x16.mp4
```

### Recortar al centro a 9:16 (sin barras, se pierde lo de los lados)
```bash
ffmpeg -i entrada.mp4 -vf "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920" -c:a copy reel_crop.mp4
```

### Cuadrado 1:1 (1080x1080) para feed
```bash
ffmpeg -i entrada.mp4 -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080" -c:a copy post_1x1.mp4
```

### Comprimir un video pesado (baja tamaño manteniendo calidad razonable)
```bash
ffmpeg -i entrada.mp4 -c:v libx264 -crf 28 -preset slow -c:a aac -b:a 96k comprimido.mp4
```

## Ejemplo de uso típico por rol
**atlas** recibe un clip largo de Edison, saca un recorte de 20 s con el gancho, lo pasa a 9:16 con `pad` y lo entrega como `reel_final.mp4` para que Jorge lo apruebe antes de publicar.

## Manejo de errores
- Si ffmpeg falla con `No such file` revisa la ruta exacta del archivo de entrada.
- Si dice `codec not currently supported in container`, cambia el contenedor de salida (`.mkv`) o re-encodea quitando `-c copy`.
- Si el resultado se ve deformado, usa la variante con `pad`/`crop`, no un `scale` a la fuerza.
- Si no sabes por qué falla, **copia el error completo y repórtaselo a Jorge**; no borres ni sobreescribas el original.

## Regla de curaduría
ffmpeg solo produce archivos locales — no publica nada. El video final **no se sube a ninguna red ni se envía a nadie sin OK explícito de Jorge**.
