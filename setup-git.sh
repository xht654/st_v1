#!/bin/bash
# setup-git.sh - Configuração Automatizada do Git

set -e

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔧 Configuração do Git para Stream Capture${NC}\n"

# Verificar se Git está instalado
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}📦 Instalando Git...${NC}"
    sudo apt update
    sudo apt install -y git
fi

echo -e "${GREEN}✅ Git instalado: $(git --version)${NC}\n"

# Configurar identidade
echo "👤 Configurar identidade Git"
read -p "Digite seu nome: " git_name
read -p "Digite seu email: " git_email

git config --global user.name "$git_name"
git config --global user.email "$git_email"

echo -e "${GREEN}✅ Identidade configurada${NC}\n"

# Escolher método de autenticação
echo "🔐 Escolha o método de autenticação:"
echo "1) HTTPS (simples, requer token)"
echo "2) SSH (recomendado, mais seguro)"
read -p "Escolha (1 ou 2): " auth_method

if [ "$auth_method" = "2" ]; then
    # Configurar SSH
    echo -e "\n${BLUE}🔑 Configurando SSH...${NC}"
    
    if [ ! -f ~/.ssh/id_ed25519 ]; then
        echo "Gerando chave SSH..."
        ssh-keygen -t ed25519 -C "$git_email" -N "" -f ~/.ssh/id_ed25519
    fi
    
    eval "$(ssh-agent -s)"
    ssh-add ~/.ssh/id_ed25519
    
    echo -e "\n${GREEN}✅ Chave SSH gerada!${NC}"
    echo -e "${YELLOW}📋 Copie esta chave e adicione no GitHub:${NC}\n"
    cat ~/.ssh/id_ed25519.pub
    echo ""
    
    read -p "Pressione Enter após adicionar a chave no GitHub..."
    
    # Testar conexão SSH
    if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
        echo -e "${GREEN}✅ Conexão SSH funcionando!${NC}\n"
        use_ssh=true
    else
        echo -e "${YELLOW}⚠️  Conexão SSH falhou. Usando HTTPS.${NC}\n"
        use_ssh=false
    fi
else
    use_ssh=false
fi

# Obter informações do repositório
read -p "Digite seu usuário GitHub: " github_user
read -p "Digite o nome do repositório: " repo_name

# Inicializar repositório local
echo -e "\n${BLUE}📦 Inicializando repositório local...${NC}"

if [ ! -d .git ]; then
    git init
    echo -e "${GREEN}✅ Repositório inicializado${NC}"
else
    echo -e "${YELLOW}⚠️  Repositório já existe${NC}"
fi

# Adicionar .gitignore se não existir
if [ ! -f .gitignore ]; then
    echo -e "\n${BLUE}📝 Criando .gitignore...${NC}"
    cat > .gitignore << 'EOF'
# Logs
logs/
*.log

# Environment
.env
.env.local

# Config with secrets
config.json
!config.example.json

# VPN
vpn/*.ovpn
vpn/auth.txt
vpn/*.key
vpn/*.crt

# TVHeadend data
tvheadend/config/
tvheadend/recordings/
tvheadend/timeshift/

# Backups
backups/
*.backup.*

# Node
node_modules/
package-lock.json

# Temporary
tmp/
temp/
*.tmp

# OS
.DS_Store
Thumbs.db

# Editors
.vscode/
.idea/
*.swp

# Docker
.dockerignore

# SSL
nginx/ssl/
*.pem
EOF
    echo -e "${GREEN}✅ .gitignore criado${NC}"
fi

# Adicionar arquivos
echo -e "\n${BLUE}📂 Adicionando arquivos...${NC}"
git add .

# Fazer commit inicial
echo -e "\n${BLUE}💾 Fazendo commit inicial...${NC}"
if git commit -m "Initial commit: Stream Capture Multi-Sessão v2.0"; then
    echo -e "${GREEN}✅ Commit realizado${NC}"
else
    echo -e "${YELLOW}⚠️  Nada para commitar ou commit já existe${NC}"
fi

# Configurar remote
if [ "$use_ssh" = true ]; then
    remote_url="git@github.com:${github_user}/${repo_name}.git"
else
    remote_url="https://github.com/${github_user}/${repo_name}.git"
fi

echo -e "\n${BLUE}🔗 Configurando remote...${NC}"
if git remote | grep -q origin; then
    git remote set-url origin "$remote_url"
    echo -e "${GREEN}✅ Remote atualizado${NC}"
else
    git remote add origin "$remote_url"
    echo -e "${GREEN}✅ Remote adicionado${NC}"
fi

# Renomear branch para main
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    git branch -M main
fi

# Push para GitHub
echo -e "\n${BLUE}🚀 Enviando para GitHub...${NC}"
if git push -u origin main; then
    echo -e "\n${GREEN}✅ Projeto enviado com sucesso!${NC}"
    echo -e "${GREEN}📍 Repositório: https://github.com/${github_user}/${repo_name}${NC}\n"
else
    echo -e "\n${YELLOW}⚠️  Falha ao enviar. Possíveis causas:${NC}"
    echo "1. Repositório não existe no GitHub"
    echo "2. Problemas de autenticação"
    echo "3. Branch já existe"
    echo ""
    echo -e "${BLUE}💡 Tente criar o repositório manualmente no GitHub primeiro${NC}"
fi

# Mostrar próximos passos
echo -e "\n${BLUE}📋 Próximos comandos úteis:${NC}"
echo "  git status          - Ver status"
echo "  git add .           - Adicionar alterações"
echo "  git commit -m 'msg' - Fazer commit"
echo "  git push            - Enviar para GitHub"
echo "  git pull            - Baixar do GitHub"
echo "  git log             - Ver histórico"
echo ""

echo -e "${GREEN}✅ Configuração concluída!${NC}"
