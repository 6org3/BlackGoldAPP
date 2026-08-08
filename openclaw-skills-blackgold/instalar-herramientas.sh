#!/bin/sh
# =====================================================================
# instalar-herramientas.sh  --  Sistem OS / OpenClaw
# Instala TODO lo que necesitan las skills del paquete.
# Idempotente: comprueba con `command -v` / contenedores existentes
# antes de instalar. Servidor Ubuntu 26.04, 16 GB RAM, usuario gorg3yj1n1.
#
# Uso:   sh instalar-herramientas.sh
# =====================================================================
set -e

echo "==> Sistem OS: instalando herramientas de las skills..."
RESUMEN=""

marca() { RESUMEN="${RESUMEN}\n  - $1"; }

# ---------------------------------------------------------------------
# 1) apt: ffmpeg  (edicion de video/audio; tambien lo usan yt-dlp,
#    KittenTTS->conversion y HyperFrames)
# ---------------------------------------------------------------------
echo "\n--- [1/6] apt: ffmpeg ---"
if command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg ya instalado, se omite."
else
  sudo apt-get update
  sudo apt-get install -y ffmpeg
  marca "ffmpeg (apt)"
fi

# ---------------------------------------------------------------------
# 2) Herramientas Python de usuario
#    Preferimos pipx para apps CLI aisladas; kittentts va con pip --user.
# ---------------------------------------------------------------------
echo "\n--- [2/6] Python (pipx / pip --user) ---"
if ! command -v pipx >/dev/null 2>&1; then
  echo "Instalando pipx..."
  sudo apt-get install -y pipx || pip install --user --break-system-packages pipx
  pipx ensurepath || true
fi

# rembg (quitar fondo) -- con extra [cli]
if command -v rembg >/dev/null 2>&1; then
  echo "rembg ya instalado, se omite."
else
  pipx install "rembg[cli]" || pip install --user --break-system-packages "rembg[cli]"
  marca "rembg (pipx)"
fi

# yt-dlp (descargar referencias)
if command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp ya instalado, se omite."
else
  pipx install yt-dlp || pip install --user --break-system-packages yt-dlp
  marca "yt-dlp (pipx)"
fi

# crawl4ai (web -> markdown). Trae el CLI `crwl`. Necesita crawl4ai-setup.
if command -v crwl >/dev/null 2>&1; then
  echo "crawl4ai (crwl) ya instalado, se omite."
else
  pipx install crawl4ai || pip install --user --break-system-packages crawl4ai
  echo "Ejecutando crawl4ai-setup (instala navegador Playwright)..."
  crawl4ai-setup || echo "# VERIFICAR: crawl4ai-setup fallo; correrlo a mano."
  marca "crawl4ai + crwl (pipx)"
fi

# browser-use (automatizacion de navegador, SOLO lectura por politica)
if python3 -c "import browser_use" >/dev/null 2>&1; then
  echo "browser-use ya instalado, se omite."
else
  pip install --user --break-system-packages browser-use
  echo "Instalando navegador de Playwright (chromium)..."
  python3 -m playwright install chromium || playwright install chromium || \
    echo "# VERIFICAR: 'playwright install chromium' fallo; correrlo a mano."
  marca "browser-use + playwright chromium (pip --user)"
fi

# KittenTTS (voz en off ligera, CPU). Se instala desde el wheel de la release.
if python3 -c "import kittentts" >/dev/null 2>&1; then
  echo "kittentts ya instalado, se omite."
else
  # URL del wheel confirmada de la release; VERIFICAR que sea la version vigente.
  pip install --user --break-system-packages "https://github.com/KittenML/KittenTTS/releases/download/0.8.1/kittentts-0.8.1-py3-none-any.whl" \
    || echo "# VERIFICAR: instalar el wheel vigente de KittenTTS releases."
  pip install --user --break-system-packages soundfile
  marca "KittenTTS + soundfile (pip --user)"
fi

# ---------------------------------------------------------------------
# 3) Docker: Stirling PDF  (puerto 8082, mem_limit 512m)
#    Imagen oficial verificada: stirlingtools/stirling-pdf (interno 8080)
# ---------------------------------------------------------------------
echo "\n--- [3/6] Docker: Stirling PDF (puerto 8082) ---"
if ! command -v docker >/dev/null 2>&1; then
  echo "# VERIFICAR: Docker no encontrado. Instala Docker/Portainer antes."
elif docker ps -a --format '{{.Names}}' | grep -q '^stirling-pdf$'; then
  echo "Contenedor 'stirling-pdf' ya existe, se omite."
else
  docker run -d \
    --name stirling-pdf \
    --restart unless-stopped \
    -p 8082:8080 \
    --memory 512m \
    -e DOCKER_ENABLE_SECURITY=false \
    stirlingtools/stirling-pdf:latest
  marca "Stirling PDF (docker, http://localhost:8082, mem 512m)"
fi

# ---------------------------------------------------------------------
# 4) Docker: Vikunja  (puerto 3456, mem_limit 512m, datos en /mnt/datos)
#    Imagen oficial unificada verificada: vikunja/vikunja (interno 3456)
# ---------------------------------------------------------------------
echo "\n--- [4/6] Docker: Vikunja (puerto 3456) ---"
if ! command -v docker >/dev/null 2>&1; then
  echo "# VERIFICAR: Docker no encontrado. Instala Docker/Portainer antes."
elif docker ps -a --format '{{.Names}}' | grep -q '^vikunja$'; then
  echo "Contenedor 'vikunja' ya existe, se omite."
else
  sudo mkdir -p /mnt/datos/vikunja
  docker run -d \
    --name vikunja \
    --restart unless-stopped \
    -p 3456:3456 \
    --memory 512m \
    -e VIKUNJA_SERVICE_PUBLICURL="http://localhost:3456" \
    -v /mnt/datos/vikunja:/db \
    -v /mnt/datos/vikunja/files:/app/vikunja/files \
    vikunja/vikunja:latest
  marca "Vikunja (docker, http://localhost:3456, mem 512m, datos en /mnt/datos/vikunja)"
fi

# ---------------------------------------------------------------------
# 5) HyperFrames  (HTML -> video). git clone + npm install en ~/tools
# ---------------------------------------------------------------------
echo "\n--- [5/6] HyperFrames (~/tools/hyperframes) ---"
if ! command -v node >/dev/null 2>&1; then
  echo "# VERIFICAR: Node.js no encontrado (HyperFrames requiere Node 22+)."
fi
mkdir -p "$HOME/tools"
if [ -d "$HOME/tools/hyperframes/.git" ]; then
  echo "HyperFrames ya clonado, se omite (para actualizar: git -C ~/tools/hyperframes pull)."
else
  git clone https://github.com/heygen-com/hyperframes "$HOME/tools/hyperframes"
  ( cd "$HOME/tools/hyperframes" && npm install )
  marca "HyperFrames (git clone + npm install en ~/tools/hyperframes)"
fi

# ---------------------------------------------------------------------
# 6) Resumen + recordatorio Vikunja
# ---------------------------------------------------------------------
echo "\n--- [6/6] Listo ---"
echo "\n=============================================================="
echo "  INSTALACION COMPLETA -- se agrego:"
if [ -z "$RESUMEN" ]; then
  echo "  (nada nuevo: todo ya estaba instalado)"
else
  printf "%b\n" "$RESUMEN"
fi
echo "=============================================================="
echo ""
echo "  SIGUIENTE PASO OBLIGATORIO -- Token de Vikunja:"
echo "   1) Abre http://localhost:3456 y crea tu cuenta / entra."
echo "   2) Settings > API Tokens > crea un token (permisos de tareas y proyectos)."
echo "   3) Escribe ~/.openclaw/vikunja.env con:"
echo "        VIKUNJA_URL=http://localhost:3456"
echo "        VIKUNJA_TOKEN=<tu_token>"
echo "   4) Luego corre:  sh repartir-skills.sh"
echo ""
echo "  NOTA RAM: Stirling + Vikunja ~ 1 GB extra. Apaga Ollama si estaba corriendo."
echo "=============================================================="
