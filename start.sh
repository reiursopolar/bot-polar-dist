#!/bin/bash

CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ██████╗  ██████╗ ██╗      █████╗ ██████╗ "
echo "  ██╔══██╗██╔═══██╗██║     ██╔══██╗██╔══██╗"
echo "  ██████╔╝██║   ██║██║     ███████║██████╔╝ "
echo "  ██╔═══╝ ██║   ██║██║     ██╔══██║██╔══██╗ "
echo "  ██║     ╚██████╔╝███████╗██║  ██║██║  ██║ "
echo "  ╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝"
echo -e "${NC}"

# Repositório público de distribuição
DIST_REPO="ReiUrsoPolar/bot-polar-dist"
DIST_BRANCH="main"

# ── Auto-atualizar ────────────────────────────────────────────────────
auto_atualizar() {
  echo -e "${YELLOW}  ↻  A verificar atualizações...${NC}"

  REPO_URL="https://github.com/${DIST_REPO}.git"

  if git rev-parse --git-dir > /dev/null 2>&1; then
    # Garantir que o remote aponta sempre para o repo PÚBLICO
    REMOTE_ATUAL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ "$REMOTE_ATUAL" != "$REPO_URL" ]; then
      git remote set-url origin "$REPO_URL" 2>/dev/null || true
      echo -e "${YELLOW}  ↻  Remote corrigido para repo público.${NC}"
    fi

    # Modo git: git pull do repo público
    ANTES=$(git rev-parse HEAD 2>/dev/null)
    git pull --quiet origin "$DIST_BRANCH" 2>/dev/null
    DEPOIS=$(git rev-parse HEAD 2>/dev/null)
    if [ "$ANTES" != "$DEPOIS" ]; then
      echo -e "${GREEN}  ✓  Atualizado! (${ANTES:0:7} → ${DEPOIS:0:7})${NC}"
      return 0   # houve atualização
    else
      echo -e "${GREEN}  ✓  Já na versão mais recente.${NC}"
      return 1   # sem alterações
    fi
  else
    # Modo download: baixar zip do repo público
    echo -e "${YELLOW}  ↓  Git não configurado — a baixar do GitHub...${NC}"
    TMP_ZIP="/tmp/polar-upd-$$.zip"
    TMP_DIR="/tmp/polar-upd-$$"
    ZIP_URL="https://github.com/${DIST_REPO}/archive/refs/heads/${DIST_BRANCH}.zip"

    if curl -sL --max-time 60 -o "$TMP_ZIP" "$ZIP_URL" 2>/dev/null; then
      mkdir -p "$TMP_DIR"
      if unzip -q -o "$TMP_ZIP" -d "$TMP_DIR" 2>/dev/null; then
        EXTRACTED=$(ls "$TMP_DIR" | head -1)
        if [ -n "$EXTRACTED" ]; then
          rsync -a \
            --exclude='config/' \
            --exclude='session/' \
            --exclude='auth_info_baileys/' \
            --exclude='database/' \
            --exclude='node_modules/' \
            "$TMP_DIR/$EXTRACTED/" ./
          # Forçar timestamp de package.json para agora para que verificar_deps detete a mudança
          touch package.json 2>/dev/null || true
          echo -e "${GREEN}  ✓  Atualizado via download!${NC}"
          rm -rf "$TMP_ZIP" "$TMP_DIR"
          return 0
        fi
      fi
      rm -rf "$TMP_ZIP" "$TMP_DIR"
    fi

    echo -e "${RED}  ✗  Não foi possível verificar atualizações (sem rede?).${NC}"
    return 1
  fi
}

# ── Verificar e instalar dependências ────────────────────────────────
instalar_deps() {
  echo -e "${YELLOW}  ↓  A instalar/atualizar dependências...${NC}"
  npm install --no-fund --no-audit --prefer-offline 2>&1 | grep -v "^npm warn" | grep -v "^$"
  echo -e "${YELLOW}  ↓  A compilar better-sqlite3...${NC}"
  npm rebuild better-sqlite3 --no-fund 2>&1 | grep -v "^npm warn"
  echo -e "${GREEN}  ✓  Dependências prontas!${NC}\n"
}

verificar_deps() {
  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}  ↗  Primeira instalação...${NC}"
    instalar_deps
  elif [ "package.json" -nt "node_modules" ]; then
    echo -e "${YELLOW}  ↗  package.json atualizado — a sincronizar dependências...${NC}"
    instalar_deps
  else
    NODE_VER=$(node -e "process.stdout.write(process.version)")
    SQLITE_OK=$(node -e "try{require('./node_modules/better-sqlite3');process.stdout.write('ok')}catch(e){process.stdout.write('no')}" 2>/dev/null)
    if [ "$SQLITE_OK" != "ok" ]; then
      echo -e "${YELLOW}  ↗  better-sqlite3 precisa de recompilação (Node ${NODE_VER})...${NC}"
      npm rebuild better-sqlite3 --no-fund 2>&1 | grep -v "^npm warn"
      echo -e "${GREEN}  ✓  Compilado!${NC}\n"
    else
      echo -e "${GREEN}  ✓  Dependências OK (Node ${NODE_VER})${NC}\n"
    fi
  fi
}

# ── Arranque: atualizar + instalar deps ──────────────────────────────
auto_atualizar
verificar_deps

# ── Auto-restart com atualização automática em cada reinício ─────────
while true; do
  node index.js
  EXIT_CODE=$?

  echo -e "\n${YELLOW}  ⚠  Bot encerrado (código ${EXIT_CODE}). A atualizar e reiniciar...${NC}\n"

  # Atualizar antes de reiniciar — se houve update, reinstalar deps
  auto_atualizar && verificar_deps

  sleep 2
done
