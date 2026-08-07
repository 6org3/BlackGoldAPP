#!/bin/sh
# =====================================================================
# repartir-skills.sh  --  Sistem OS / OpenClaw
# Copia cada skill al workspace de su(s) agente(s).
# OpenClaw descubre skills en:  <workspace>/skills/<nombre>/SKILL.md
# Idempotente: mkdir -p + cp -r (re-copia y sobreescribe sin romper).
#
# Uso:  sh repartir-skills.sh
# =====================================================================
set -e

# Carpeta de skills fuente (junto a este script)
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SKILLS_SRC="$SCRIPT_DIR/skills"

if [ ! -d "$SKILLS_SRC" ]; then
  echo "ERROR: no encuentro la carpeta de skills en $SKILLS_SRC"
  exit 1
fi

# Raiz de workspaces de OpenClaw
OC="$HOME/.openclaw"

# Mapa agente -> workspace
ws_de() {
  case "$1" in
    vegapunk)   echo "$OC/workspace" ;;
    *)          echo "$OC/workspace-$1" ;;
  esac
}

# Mapa agente -> skills (separadas por espacio)
skills_de() {
  case "$1" in
    vegapunk)    echo "vikunja blackgold-knowledge direccion-blackgold crm-auditoria secure-records-supervision infra-health" ;;
    shaka)       echo "personal-vault blackgold-vault cross-vault-export pii-filter zettelkasten link-integrity git-sync-safe" ;;
    edison)      echo "crawl4ai browser-readonly content-os brand-blackgold blackgold-knowledge-read vikunja-contenido" ;;
    atlas)       echo "ffmpeg rembg ytdlp tts hyperframes stirling worker-dispatch asset-manifest" ;;
    lilith)      echo "blackgold-kb-public crm-intake crm-conversacion consentimiento handoff-humano resumen-comercial" ;;
    pythagoras)  echo "finanzas-blackgold-readonly conciliacion secure-finance-documents reportes vikunja-escalado" ;;
  esac
}

AGENTES="vegapunk shaka edison atlas lilith pythagoras"

echo "==> Repartiendo skills a los workspaces de los agentes..."
echo ""

for agente in $AGENTES; do
  WS=$(ws_de "$agente")
  DEST="$WS/skills"
  mkdir -p "$DEST"
  # Las skills son una allowlist física por workspace. La limpieza evita que
  # un permiso revocado sobreviva como una copia antigua.
  if [ -f "$SCRIPT_DIR/skills-manifest.json" ]; then
    python3 - "$SCRIPT_DIR/skills-manifest.json" "$DEST" <<'PY'
import json, pathlib, shutil, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
dest = pathlib.Path(sys.argv[2])
for skill in manifest.get("skills", []):
    target = dest / skill["name"]
    if target.is_dir():
        shutil.rmtree(target)
PY
  fi
  # Limpiar también las herramientas heredadas para que cada agente reciba
  # solo las que aparecen en su mapa actual. Esto revoca rembg/stirling/inbox
  # de Lily y cualquier permiso residual de repartos anteriores.
  for legacy in vikunja inbox browseruse crawl4ai ffmpeg hyperframes rembg stirling tts ytdlp; do
    rm -rf "$DEST/$legacy"
  done
  for skill in $(skills_de "$agente"); do
    if [ -d "$SKILLS_SRC/$skill" ]; then
      cp -r "$SKILLS_SRC/$skill" "$DEST/"
    else
      echo "  # VERIFICAR: no existe la skill fuente '$skill' (agente $agente)"
    fi
  done
done

# ---------------------------------------------------------------------
# Imprimir el mapa final
# ---------------------------------------------------------------------
echo "=============================================================="
echo "  MAPA REPARTIDO  (agente -> skills)"
echo "=============================================================="
for agente in $AGENTES; do
  WS=$(ws_de "$agente")
  printf "  %-11s -> %s\n" "$agente" "$(skills_de "$agente")"
  printf "  %-11s    (%s/skills/)\n" "" "$WS"
done
echo "=============================================================="
echo ""
echo "  RECORDATORIOS:"
echo "   - Verifica el descubrimiento:   openclaw doctor"
echo "   - Reinicia el gateway para que tome las skills nuevas."
echo ""
echo "  IMPORTANTE (allowlist): NO se toca agents.list[].skills."
echo "  Sin allowlist, OpenClaw descubre todas las skills del workspace."
echo "  Si algun dia se agrega agents.list[].skills, RECUERDA que ese"
echo "  listado REEMPLAZA al descubrimiento automatico (hay que listar"
echo "  ahi todas las skills que el agente deba tener)."
echo "=============================================================="
