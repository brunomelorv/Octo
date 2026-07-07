#!/bin/bash
# ============================================================================
# setup-vps.sh — Script de setup inicial para VPS
# ============================================================================
# Uso: bash setup-vps.sh
#
# O que faz:
#   1. Verifica se Docker e Docker Compose estão instalados
#   2. Cria o .env a partir do .env.example (se não existir)
#   3. Gera uma SECRET_KEY segura automaticamente
#   4. Ajusta permissões do diretório Database/
#   5. Cria diretórios necessários (backups, ssl/certs)
#   6. Sobe os containers
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Lead Analytics CRM — Setup VPS${NC}"
echo "============================================"

# 1. Verificar Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker não encontrado. Instale primeiro:${NC}"
    echo "   curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose não encontrado.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker e Docker Compose encontrados${NC}"

# Detectar comando compose
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

# 2. Criar .env se não existir
if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Criando .env a partir de .env.example...${NC}"
    cp .env.example .env
    
    # Gerar SECRET_KEY segura
    NEW_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))" 2>/dev/null || openssl rand -base64 48)
    sed -i "s|sua_chave_secreta_aqui_para_producao_gerada|${NEW_KEY}|g" .env
    echo -e "${GREEN}✅ .env criado com SECRET_KEY segura${NC}"
else
    echo -e "${GREEN}✅ .env já existe${NC}"
fi

# 3. Criar diretórios necessários
mkdir -p Database/backups
mkdir -p Database/leads_facebook
mkdir -p Database/chamadas_pitchyes
mkdir -p ssl/certs
echo -e "${GREEN}✅ Diretórios criados${NC}"

# 4. Ajustar permissões do Database (UID 10001 = appuser no container)
echo -e "${YELLOW}🔒 Ajustando permissões do Database/...${NC}"
sudo chown -R 10001:10001 ./Database 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Não foi possível alterar owner (rode com sudo se necessário)${NC}"
    chmod -R 777 ./Database
    echo -e "${YELLOW}   Usando chmod 777 como fallback${NC}"
}
echo -e "${GREEN}✅ Permissões ajustadas${NC}"

# 5. Escolher compose file
echo ""
echo "Qual modo deseja usar?"
echo "  1) Desenvolvimento (porta 3000, sem SSL)"
echo "  2) Produção (porta 80/443, com SSL)"
read -p "Escolha [1/2]: " MODE

if [ "$MODE" = "2" ]; then
    if [ ! -f ssl/certs/fullchain.pem ] || [ ! -f ssl/certs/privkey.pem ]; then
        echo -e "${YELLOW}⚠️  Certificados SSL não encontrados em ssl/certs/${NC}"
        echo "   Gere com: sudo certbot certonly --standalone -d seudominio.com"
        echo "   E copie fullchain.pem e privkey.pem para ssl/certs/"
        echo ""
        read -p "Deseja continuar sem SSL (modo dev)? [s/N]: " CONTINUE
        if [ "$CONTINUE" != "s" ] && [ "$CONTINUE" != "S" ]; then
            exit 1
        fi
        COMPOSE_FILE="docker-compose.yml"
    else
        COMPOSE_FILE="docker-compose.prod.yml"
    fi
else
    COMPOSE_FILE="docker-compose.yml"
fi

# 6. Subir containers
echo ""
echo -e "${GREEN}🐳 Subindo containers com ${COMPOSE_FILE}...${NC}"
$COMPOSE -f $COMPOSE_FILE up --build -d

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ Deploy concluído!${NC}"
echo ""
$COMPOSE -f $COMPOSE_FILE ps
echo ""
if [ "$COMPOSE_FILE" = "docker-compose.yml" ]; then
    echo -e "🌐 Acesse: ${GREEN}http://$(hostname -I | awk '{print $1}'):3000${NC}"
else
    echo -e "🌐 Acesse: ${GREEN}https://seudominio.com${NC}"
fi
echo ""
echo -e "${YELLOW}📋 Comandos úteis:${NC}"
echo "   Logs:     $COMPOSE -f $COMPOSE_FILE logs -f"
echo "   Parar:    $COMPOSE -f $COMPOSE_FILE down"
echo "   Rebuild:  $COMPOSE -f $COMPOSE_FILE up --build -d"
