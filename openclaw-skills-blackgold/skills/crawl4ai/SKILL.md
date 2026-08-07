---
name: crawl4ai
description: Crawlea una URL o lista de URLs y devuelve markdown limpio listo para LLM (research de leads y competencia).
---

# crawl4ai — web a markdown para research

## Cuándo usarla
Cuando necesites **leer una web y convertirla en markdown limpio** para analizar: perfiles de **leads**, webs de **competencia**, artículos, catálogos. Ideal antes de pasarle el contenido a un LLM. Roles: **edison** (research de contenido) y apoyo a leads.

## Comandos exactos (copy-paste)

### Crawlear una URL a markdown por stdout
```bash
crwl "https://ejemplo.com" -o markdown
```

### Markdown filtrado (más legible, quita ruido/menús)
```bash
crwl "https://ejemplo.com" -o markdown-fit
```

### Guardar a archivo
```bash
crwl "https://ejemplo.com" -o markdown > research_ejemplo.md
```

### Forzar contenido fresco (sin cache) y con log
```bash
crwl "https://ejemplo.com" -o markdown --bypass-cache -v
```

### Lista de URLs en lote
```bash
while read -r url; do
  [ -z "$url" ] && continue
  slug=$(echo "$url" | sed 's~https\?://~~; s~[/?].*~~; s~\.~_~g')
  crwl "$url" -o markdown-fit > "research_${slug}.md"
done < urls.txt
```

## Ejemplo de uso típico por rol
**edison** tiene 8 webs de competidores en `urls.txt`, las crawlea en lote a markdown y luego resume propuestas de valor y ganchos para el research de contenido. Para leads, se saca el markdown de la web del prospecto y se extraen datos de contacto/servicios.

## Manejo de errores
- Primera vez: tras `pip install crawl4ai` hay que correr **`crawl4ai-setup`** (instala el navegador Playwright). Si `crwl` falla con error de navegador, corre `crawl4ai-setup` y reporta a Jorge si sigue fallando.
- Si una web bloquea el crawler o pide login, **no fuerces**: anótalo y sigue con las demás.
- Si el markdown sale vacío/roto (mucho JS), prueba `-o markdown-fit`; si aun así falla, repórtalo a Jorge.

## Regla de curaduría
Crawlear para research interno es libre. Pero **contactar a un lead o publicar algo basado en lo encontrado requiere OK explícito de Jorge**. Respeta términos de uso de los sitios.
