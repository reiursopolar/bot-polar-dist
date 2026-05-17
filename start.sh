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

# ── Verificar e instalar dependências ────────────────────────────────
instalar_deps() {
  echo -e "${YELLOW}  ↓  A instalar/atualizar dependências...${NC}"
  npm install --no-fund --no-audit --prefer-offline 2>&1 | grep -v "^npm warn" | grep -v "^$"

  # Rebuild better-sqlite3 (necessário após install ou mudança de Node.js)
  echo -e "${YELLOW}  ↓  A compilar better-sqlite3...${NC}"
  npm rebuild better-sqlite3 --no-fund 2>&1 | grep -v "^npm warn"

  echo -e "${GREEN}  ✓  Dependências prontas!${NC}\n"
}

if [ ! -d "node_modules" ]; then
  # node_modules não existe — instalar tudo
  echo -e "${YELLOW}  ↗  Primeira instalação...${NC}"
  instalar_deps
elif [ "package.json" -nt "node_modules" ]; then
  # package.json mais recente que node_modules — novas dependências adicionadas
  echo -e "${YELLOW}  ↗  package.json atualizado — a sincronizar dependências...${NC}"
  instalar_deps
else
  # Verificar se better-sqlite3 está compilado para esta versão do Node
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

# ── Auto-restart ──────────────────────────────────────────────────────
while true; do
  node index.js
  echo -e "\n${YELLOW}  ⚠  Bot encerrado. A reiniciar em 3s...${NC}\n"
  sleep 3
done
