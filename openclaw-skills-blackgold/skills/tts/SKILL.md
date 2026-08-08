---
name: tts
description: Genera voz en off ligera (locución) a partir de texto con KittenTTS, corriendo en CPU sin GPU.
---

# tts — voz en off ligera con KittenTTS

## Cuándo usarla
Cuando necesites convertir un guion o texto en un **archivo de audio de locución (voz en off)** para un reel, short o video, sin depender de servicios de pago ni GPU. Modelo diminuto (<25 MB), corre en **CPU** con ONNX. Rol principal: **atlas** (media).

## Comandos exactos (copy-paste)

### Generar un WAV desde Python (forma confirmada del repo)
```bash
python3 - <<'PY'
from kittentts import KittenTTS
import soundfile as sf

model = KittenTTS("KittenML/kitten-tts-mini-0.8")   # VERIFICAR nombre de modelo vigente en el repo/HuggingFace
audio = model.generate("En Black Gold, el oro se forja.", voice="Jasper")
sf.write("locucion.wav", audio, 24000)
print("OK -> locucion.wav")
PY
```

### Atajo con método integrado a archivo
```bash
python3 - <<'PY'
from kittentts import KittenTTS
model = KittenTTS("KittenML/kitten-tts-mini-0.8")
model.generate_to_file("Texto a locutar.", "locucion.wav", voice="Bella")
PY
```

### Voces disponibles
`Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki, Leo` (parámetro `voice=`).

### Convertir el WAV a MP3 si hace falta (usa la skill ffmpeg)
```bash
ffmpeg -i locucion.wav -c:a libmp3lame -q:a 2 locucion.mp3
```

## Ejemplo de uso típico por rol
**edison** escribe un guion de 20 s; **atlas** lo pasa por KittenTTS con voz `Jasper`, saca `locucion.wav`, y la mezcla en el reel con ffmpeg. El resultado se muestra a Jorge antes de publicar.

## Manejo de errores
- KittenTTS habla **inglés** de forma nativa; con texto en español la pronunciación puede fallar. Si suena mal, repórtalo a Jorge en vez de entregar audio raro.
- La primera vez descarga el modelo; si falla la descarga o el `import`, la skill no está bien instalada (`pip install <wheel de KittenTTS releases>` + `soundfile`). Avisa a Jorge.  # VERIFICAR URL del wheel de la release vigente
- Si `soundfile` no está: `pip install soundfile`.

## Regla de curaduría
El audio generado es un borrador local. **No se publica ni se usa en material que sale a clientes sin OK explícito de Jorge.**
