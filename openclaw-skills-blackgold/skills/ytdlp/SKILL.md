---
name: ytdlp
description: Descarga video o audio de una URL como material de referencia/inspiración para research y guiones.
---

# ytdlp — descargar referencias de video/audio

## Cuándo usarla
Cuando necesites bajar un video o su audio **como material de referencia o inspiración** (estudiar un formato de reel, transcribir una charla, analizar a la competencia). Rol principal: **atlas** (media), apoyo a research de **edison**.

> ⚠️ **Solo material de referencia.** Descargar para estudiar es una cosa; **republicar contenido ajeno es otra**. Nada descargado se publica sin revisar derechos y sin OK de Jorge.

## Comandos exactos (copy-paste)

### Descargar el video (mejor calidad, MP4)
```bash
yt-dlp -f "bv*+ba/b" --merge-output-format mp4 -o "%(title)s.%(ext)s" "URL"
```

### Descargar solo el audio a MP3
```bash
yt-dlp -x --audio-format mp3 -o "%(title)s.%(ext)s" "URL"
```

### Descargar en calidad limitada (para ahorrar disco/ancho de banda)
```bash
yt-dlp -f "bv*[height<=720]+ba/b[height<=720]" -o "%(title)s.%(ext)s" "URL"
```

### Solo los subtítulos (útil para transcribir/estudiar guion)
```bash
yt-dlp --write-auto-subs --sub-lang es,en --skip-download -o "%(title)s.%(ext)s" "URL"
```

### Ver formatos disponibles antes de bajar
```bash
yt-dlp -F "URL"
```

## Ejemplo de uso típico por rol
**edison** encuentra un reel viral de un competidor; pide a **atlas** bajarlo con `yt-dlp` y sacar los subtítulos para analizar el gancho y la estructura del guion. El material queda en `~/referencias/` y **nunca se republica tal cual**.

## Manejo de errores
- Si falla con `Unsupported URL` o `HTTP Error 403`, puede ser que el sitio bloquee o que haya que actualizar yt-dlp (`pipx upgrade yt-dlp` / `pip install -U yt-dlp`). Repórtalo a Jorge.
- Si pide login/cookies (contenido privado o con edad), **no intentes saltártelo**: avisa a Jorge.
- Si el merge falla, verifica que **ffmpeg** esté instalado (yt-dlp lo usa para unir audio+video).

## Regla de curaduría
Descarga = referencia interna. **Publicar, monetizar o reutilizar material descargado requiere revisar derechos y OK explícito de Jorge.**
