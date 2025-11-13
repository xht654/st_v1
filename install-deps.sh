#!/bin/bash

# Stream Capture Multi-Sessão - Instalação de Dependências v2.0

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE} Stream Capture Multi-Sessão v2.0              ${NC}"
    echo -e "${BLUE} Instalação de Dependências                    ${NC}"
    echo -e "${BLUE}================================================${NC}\n"
}

# Detectar sistema operacional
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si)
        VER=$(lsb_release -sr)
    elif [ -f /etc/lsb-release ]; then
        . /etc/lsb-release
        OS=$DISTRIB_ID
        VER=$DISTRIB_RELEASE
    elif [ -f /etc/debian_version ]; then
        OS=Debian
        VER=$(cat /etc/debian_version)
    else
        OS=$(uname -s)
        VER=$(uname -r)
    fi
}

# Verificar se comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verificar dependências
check_system_requirements() {
    print_info "🔍 Verificando requisitos do sistema..."
    
    # Verificar memória (recomendado: 4GB+)
    local mem_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$mem_gb" -lt 2 ]; then
        print_warning "Apenas ${mem_gb}GB de RAM detectado. Recomendado: 4GB+"
    else
        print_success "Memória suficiente: ${mem_gb}GB"
    fi
    
    # Verificar espaço em disco (recomendado: 10GB+)
    local disk_gb=$(df -BG / | awk 'NR==2{print $4}' | sed 's/G//')
    if [ "$disk_gb" -lt 5 ]; then
        print_warning "Apenas ${disk_gb}GB de espaço livre. Recomendado: 10GB+"
    else
        print_success "Espaço em disco suficiente: ${disk_gb}GB"
    fi
    
    # Verificar arquitetura
    local arch=$(uname -m)
    if [[ "$arch" != "x86_64" && "$arch" != "amd64" ]]; then
        print_warning "Arquitetura $arch pode não ser totalmente suportada"
    else
        print_success "Arquitetura suportada: $arch"
    fi
}

# Atualizar sistema
update_system() {
    print_info "🔄 Atualizando sistema..."
    
    case "$OS" in
        *"Ubuntu"*|*"Debian"*)
            sudo apt update && sudo apt upgrade -y
            ;;
        *"CentOS"*|*"Red Hat"*|*"Fedora"*)
            if command_exists dnf; then
                sudo dnf update -y
            else
                sudo yum update -y
            fi
            ;;
        *"Arch"*)
            sudo pacman -Syu --noconfirm
            ;;
        *)
            print_warning "Sistema não reconhecido. Atualize manualmente."
            ;;
    esac
    
    print_success "Sistema atualizado"
}

# Instalar dependências básicas
install_basic_deps() {
    print_info "📦 Instalando dependências básicas..."
    
    case "$OS" in
        *"Ubuntu"*|*"Debian"*)
            sudo apt install -y \
                curl \
                wget \
                git \
                jq \
                net-tools \
                unzip \
                ca-certificates \
                gnupg \
                lsb-release \
                software-properties-common \
                apt-transport-https
            ;;
        *"CentOS"*|*"Red Hat"*|*"Fedora"*)
            if command_exists dnf; then
                sudo dnf install -y curl wget git jq net-tools unzip ca-certificates gnupg
            else
                sudo yum install -y curl wget git jq net-tools unzip ca-certificates gnupg
            fi
            ;;
        *"Arch"*)
            sudo pacman -S --noconfirm curl wget git jq net-tools unzip ca-certificates gnupg
            ;;
        *)
            print_error "Sistema não suportado para instalação automática"
            exit 1
            ;;
    esac
    
    print_success "Dependências básicas instaladas"
}

# Instalar Docker
install_docker() {
    if command_exists docker; then
        print_success "Docker já está instalado"
        docker --version
        return
    fi
    
    print_info "🐳 Instalando Docker..."
    
    case "$OS" in
        *"Ubuntu"*|*"Debian"*)
            # Adicionar repositório oficial do Docker
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            sudo apt update
            sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;
        *"CentOS"*|*"Red Hat"*|*"Fedora"*)
            # Instalar via script oficial
            curl -fsSL https://get.docker.com -o get-docker.sh
            sudo sh get-docker.sh
            rm get-docker.sh
            ;;
        *)
            # Script oficial para outros sistemas
            curl -fsSL https://get.docker.com -o get-docker.sh
            sudo sh get-docker.sh
            rm get-docker.sh
            ;;
    esac
    
    # Adicionar usuário ao grupo docker
    sudo usermod -aG docker $USER
    
    # Habilitar Docker para iniciar automaticamente
    sudo systemctl enable docker
    sudo systemctl start docker
    
    print_success "Docker instalado com sucesso"
    docker --version
}

# Instalar Docker Compose
install_docker_compose() {
    if command_exists docker-compose; then
        print_success "Docker Compose já está instalado"
        docker-compose --version
        return
    fi
    
    print_info "🔧 Instalando Docker Compose..."
    
    # Instalar versão mais recente
    local latest_version=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    
    sudo curl -L "https://github.com/docker/compose/releases/download/${latest_version}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    
    # Criar link se necessário
    if [ ! -f /usr/bin/docker-compose ]; then
        sudo ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose
    fi
    
    print_success "Docker Compose instalado com sucesso"
    docker-compose --version
}

# Instalar Node.js (para desenvolvimento)
install_nodejs() {
    if command_exists node; then
        local node_version=$(node --version)
        print_success "Node.js já está instalado: $node_version"
        return
    fi
    
    print_info "📗 Instalando Node.js..."
    
    case "$OS" in
        *"Ubuntu"*|*"Debian"*)
            # Usar NodeSource repository
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        *"CentOS"*|*"Red Hat"*|*"Fedora"*)
            # Usar NodeSource repository
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            if command_exists dnf; then
                sudo dnf install -y nodejs npm
            else
                sudo yum install -y nodejs npm
            fi
            ;;
        *"Arch"*)
            sudo pacman -S --noconfirm nodejs npm
            ;;
        *)
            print_warning "Instale Node.js manualmente para seu sistema"
            ;;
    esac
    
    if command_exists node; then
        print_success "Node.js instalado com sucesso"
        node --version
        npm --version
    fi
}

# Instalar ferramentas opcionais
install_optional_tools() {
    print_info "🛠️ Instalando ferramentas opcionais..."
    
    # OpenVPN (para VPN)
    if ! command_exists openvpn; then
        case "$OS" in
            *"Ubuntu"*|*"Debian"*)
                sudo apt install -y openvpn
                ;;
            *"CentOS"*|*"Red Hat"*|*"Fedora"*)
                if command_exists dnf; then
                    sudo dnf install -y openvpn
                else
                    sudo yum install -y openvpn
                fi
                ;;
            *"Arch"*)
                sudo pacman -S --noconfirm openvpn
                ;;
        esac
        
        if command_exists openvpn; then
            print_success "OpenVPN instalado"
        fi
    else
        print_success "OpenVPN já está instalado"
    fi
    
    # Streamlink (para desenvolvimento/teste)
    if ! command_exists streamlink; then
        case "$OS" in
            *"Ubuntu"*|*"Debian"*)
                sudo apt install -y python3-pip
                sudo pip3 install streamlink
                ;;
            *"CentOS"*|*"Red Hat"*|*"Fedora"*)
                if command_exists dnf; then
                    sudo dnf install -y python3-pip
                else
                    sudo yum install -y python3-pip
                fi
                sudo pip3 install streamlink
                ;;
            *"Arch"*)
                sudo pacman -S --noconfirm streamlink
                ;;
        esac
        
        if command_exists streamlink; then
            print_success "Streamlink instalado"
        fi
    else
        print_success "Streamlink já está instalado"
    fi
}

# Configurar firewall
configure_firewall() {
    print_info "🔥 Configurando firewall..."
    
    if command_exists ufw; then
        # Ubuntu/Debian UFW
        sudo ufw allow 3001/tcp comment "Stream Capture Web UI"
        sudo ufw allow 8080/tcp comment "Stream Capture HTTP Server"
        sudo ufw allow 9981/tcp comment "TVHeadend Web"
        sudo ufw allow 9982/tcp comment "TVHeadend HTSP"
        
        # Não habilitar automaticamente se estiver desabilitado
        if sudo ufw status | grep -q "Status: active"; then
            print_success "Regras UFW adicionadas"
        else
            print_info "UFW não está ativo. Regras adicionadas mas não aplicadas."
        fi
    elif command_exists firewall-cmd; then
        # CentOS/RHEL/Fedora firewalld
        sudo firewall-cmd --permanent --add-port=3001/tcp
        sudo firewall-cmd --permanent --add-port=8080/tcp
        sudo firewall-cmd --permanent --add-port=9981/tcp
        sudo firewall-cmd --permanent --add-port=9982/tcp
        sudo firewall-cmd --reload
        print_success "Regras firewalld configuradas"
    else
        print_warning "Firewall não detectado. Configure manualmente as portas: 3001, 8080, 9981, 9982"
    fi
}

# Verificar instalação
verify_installation() {
    print_info "✅ Verificando instalação..."
    
    local errors=0
    
    # Verificar Docker
    if command_exists docker; then
        if docker --version >/dev/null 2>&1; then
            print_success "Docker: $(docker --version)"
        else
            print_error "Docker instalado mas não funcional"
            errors=$((errors + 1))
        fi
    else
        print_error "Docker não encontrado"
        errors=$((errors + 1))
    fi
    
    # Verificar Docker Compose
    if command_exists docker-compose; then
        if docker-compose --version >/dev/null 2>&1; then
            print_success "Docker Compose: $(docker-compose --version)"
        else
            print_error "Docker Compose instalado mas não funcional"
            errors=$((errors + 1))
        fi
    else
        print_error "Docker Compose não encontrado"
        errors=$((errors + 1))
    fi
    
    # Verificar grupo docker
    if groups $USER | grep -q docker; then
        print_success "Usuário $USER está no grupo docker"
    else
        print_warning "Usuário $USER não está no grupo docker. Execute: newgrp docker"
    fi
    
    # Verificar jq
    if command_exists jq; then
        print_success "jq: $(jq --version)"
    else
        print_warning "jq não encontrado (opcional)"
    fi
    
    # Verificar OpenVPN
    if command_exists openvpn; then
        print_success "OpenVPN: $(openvpn --version | head -n1)"
    else
        print_warning "OpenVPN não encontrado (necessário para VPN)"
    fi
    
    return $errors
}

# Mostrar próximos passos
show_next_steps() {
    echo ""
    print_info "📋 Próximos passos:"
    echo ""
    echo "1. 🔑 Logout/login para aplicar grupo docker:"
    echo "   logout && login"
    echo "   OU: newgrp docker"
    echo ""
    echo "2. 📥 Baixar/clonar o projeto:"
    echo "   git clone <repository-url>"
    echo "   cd stream-capture-project"
    echo ""
    echo "3. ⚙️ Configuração inicial:"
    echo "   ./manage.sh setup"
    echo ""
    echo "4. 🚀 Iniciar sistema:"
    echo "   ./manage.sh start"
    echo ""
    echo "5. 🌐 Acessar interface:"
    echo "   Web UI: http://localhost:3001"
    echo "   TVHeadend: http://localhost:9981"
    echo ""
    echo "📖 Para mais informações: ./manage.sh help"
    echo ""
}

# Função principal
main() {
    print_header
    
    # Verificar se é root
    if [ "$EUID" -eq 0 ]; then
        print_error "Não execute este script como root!"
        print_info "Execute como usuário normal. Sudo será solicitado quando necessário."
        exit 1
    fi
    
    # Detectar sistema
    detect_os
    print_info "Sistema detectado: $OS $VER"
    
    # Verificar requisitos
    check_system_requirements
    
    echo ""
    print_warning "Este script irá instalar:"
    echo "  - Docker & Docker Compose"
    echo "  - Node.js (opcional)"
    echo "  - OpenVPN (para VPN)"
    echo "  - Streamlink (para testes)"
    echo "  - Dependências básicas"
    echo ""
    
    read -p "Continuar? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Instalação cancelada"
        exit 0
    fi
    
    echo ""
    
    # Instalação
    update_system
    install_basic_deps
    install_docker
    install_docker_compose
    
    # Perguntar sobre opcionais
    echo ""
    read -p "Instalar Node.js? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_nodejs
    fi
    
    read -p "Instalar ferramentas opcionais (OpenVPN, Streamlink)? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_optional_tools
    fi
    
    read -p "Configurar firewall? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        configure_firewall
    fi
    
    echo ""
    
    # Verificar instalação
    if verify_installation; then
        print_success "🎉 Instalação concluída com sucesso!"
        show_next_steps
    else
        print_error "❌ Alguns componentes falharam na instalação"
        print_info "Verifique os erros acima e tente instalar manualmente"
        exit 1
    fi
}

# Executar se chamado diretamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

