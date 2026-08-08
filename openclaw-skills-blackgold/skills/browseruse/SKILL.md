---
name: browseruse
description: Automatiza el navegador (browser-use) para SOLO leer/navegar y verificar publicaciones o buscar leads — nunca actuar sin OK.
---

# browseruse — automatización de navegador (SOLO LECTURA)

## ⚠️ SKILL CON FRENO
Esta skill **solo navega y lee**. Está **PROHIBIDO** postear, comprar, enviar formularios, iniciar sesión con credenciales de Jorge, dar "me gusta", enviar mensajes o cualquier acción que modifique algo, **a menos que Jorge lo autorice EXPLÍCITAMENTE en el mensaje de esa tarea**. Ante la duda: navegar y reportar, no actuar.

## Cuándo usarla
Cuando necesites que un navegador real recorra páginas para: **verificar que una publicación salió**, **buscar leads** (directorios, perfiles públicos), **comprobar precios/estado** de una web. Roles: **edison** (verificar publicaciones) y lead-gen.

## Comandos exactos (copy-paste)

### Tarea de navegación de solo lectura (Python)
```bash
python3 - <<'PY'
import asyncio
from browser_use import Agent
from browser_use.llm import ChatOpenAI   # o el proveedor LLM configurado; VERIFICAR import segun version

async def main():
    agent = Agent(
        task="Abre https://ejemplo.com y dime SOLO el precio del producto X y si hay stock. No hagas clic en comprar ni llenes formularios.",
        llm=ChatOpenAI(model="gpt-4o-mini"),   # VERIFICAR modelo/clave disponibles en el servidor
    )
    resultado = await agent.run()
    print(resultado)

asyncio.run(main())
PY
```

### Instalación del navegador (una vez)
```bash
playwright install chromium
```

## Ejemplo de uso típico por rol
**edison** publicó un reel y pide verificar que aparece en el perfil: browser-use abre la URL pública, confirma que está visible y reporta. **No interactúa** con el post. Para lead-gen, recorre un directorio público y lista nombres/URLs de prospectos — el contacto lo decide Jorge.

## Manejo de errores
- Si la tarea requiere login o tocar un botón de acción, **DETENTE y pregúntale a Jorge**; no uses credenciales ni completes la acción.
- Si `browser_use` o el navegador no arrancan, corre `playwright install chromium` y verifica que haya clave de LLM configurada. Reporta a Jorge si falla.
- Si una web bloquea la automatización (captcha, anti-bot), **no la burles**: anótalo y reporta.
- Si el agente "se pierde" o hace algo inesperado, córtalo y reporta el log a Jorge.

## Regla de curaduría (la más estricta de todo el paquete)
**Cero acciones hacia afuera sin OK explícito de Jorge en el mensaje.** Esta skill lee y reporta. Publicar, comprar, enviar o mensajear = solo con autorización textual y específica de Jorge.
