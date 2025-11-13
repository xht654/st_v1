#!/bin/bash
# deploy.sh - Deploy Stream Capture Multi-Sessão v2.0 HLS

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} Stream Capture v2.0 HLS - Deploy     ${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Verificar Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker não encontrado!"
        echo "Execute: ./install-deps.sh"
        exit 1
    fi
    
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose não encontrado!"
        exit 1
    fi
    
    print_success "Docker instalado: $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
}

# Criar estrutura de diretórios
create_directories() {
    print_info "Criando estrutura de diretórios..."
    
    mkdir -p logs
    mkdir -p hls
    mkdir -p tvheadend/{config,recordings,timeshift}
    mkdir -p vpn
    mkdir -p nginx/ssl
    mkdir -p backups
    mkdir -p redis_data
    
    print_success "Diretórios criados"
}

# Verificar .env
check_env() {
    if [ ! -f .env ]; then
        print_warning "Arquivo .env não encontrado"
        read -p "Deseja criar um .env padrão? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp .env.example .env 2>/dev/null || {
                print_error ".env.example não encontrado"
                exit 1
            }
            print_success ".env criado - EDITE-O antes de continuar!"
            nano .env
        else
            print_error "Arquivo .env necessário"
            exit 1
        fi
    else
        print_success "Arquivo .env encontrado"
    fi
}

# Verificar config.json
check_config() {
    if [ ! -f config.json ]; then
        print_error "config.json não encontrado!"
        exit 1
    fi
    print_success "config.json encontrado"
}

# Limpar containers antigos
cleanup_old() {
    print_info "Limpando containers antigos..."
    
    docker compose down -v 2>/dev/null || true
    
    print_success "Cleanup concluído"
}

# Build
build_images() {
    print_info "Building images Docker..."
    
    docker compose build --no-cache
    
    print_success "Build concluído"
}

# Iniciar serviços
start_services() {
    local profile="$1"
    
    print_info "Iniciando serviços..."
    
    if [ -n "$profile" ]; then
        docker compose --profile "$profile" up -d
    else
        docker compose up -d
    fi
    
    print_success "Serviços iniciados"
}

# Aguardar serviços
wait_for_services() {
    print_info "Aguardando serviços ficarem prontos..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3001/api/status > /dev/null 2>&1; then
            print_success "Web UI está online"
            break
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo ""
    
    if [ $attempt -eq $max_attempts ]; then
        print_warning "Timeout aguardando serviços"
    fi
}

# Verificar status
check_status() {
    print_info "Verificando status dos serviços..."
    
    echo ""
    docker compose ps
    echo ""
    
    # Verificar Web UI
    if curl -s http://localhost:3001/api/status > /dev/null 2>&1; then
        print_success "Web UI: http://localhost:3001"
    else
        print_error "Web UI: Offline"
    fi
    
    # Verificar HLS Server
    if curl -s http://localhost:8080/status > /dev/null 2>&1; then
        print_success "HLS Server: http://localhost:8080"
    else
        print_error "HLS Server: Offline"
    fi
    
    # Verificar TVHeadend
    if curl -s http://localhost:9981 > /dev/null 2>&1; then
        print_success "TVHeadend: http://localhost:9981"
    else
        print_error "TVHeadend: Offline"
    fi
}

# Mostrar próximos passos
show_next_steps() {
    echo ""
    print_info "📋 Próximos Passos:"
    echo ""
    echo "  1. 🌐 Acessar Web UI:"
    echo "     http://localhost:3001"
    echo ""
    echo "  2. 📺 Acessar TVHeadend:"
    echo "     http://localhost:9981"
    echo ""
    echo "  3. 🎬 Testar HLS:"
    echo "     vlc http://localhost:8080/hls/<site_id>/stream.m3u8"
    echo ""
    echo "  4. 📊 Ver logs:"
    echo "     docker compose logs -f stream-capture"
    echo ""
    echo "  5. ⚙️ Configurar sites:"
    echo "     Edite config.json ou use Web UI"
    echo ""
    echo "  6. 🚀 Iniciar captura:"
    echo "     curl -X POST http://localhost:3001/api/sessions/start-parallel"
    echo ""
}

# Menu principal
show_menu() {
    print_header
    
    echo "Escolha o modo de deploy:"
    echo ""
    echo "  1) Deploy Básico (TVHeadend + Stream Capture)"
    echo "  2) Deploy com Redis (+ cache)"
    echo "  3) Deploy com Nginx (+ load balancer)"
    echo "  4) Deploy Completo (todos os serviços)"
    echo "  5) Rebuild (sem cache)"
    echo "  6) Parar todos os serviços"
    echo "  0) Sair"
    echo ""
    read -p "Opção: " -n 1 -r option
    echo ""
    
    case $option in
        1)
            deploy_basic
            ;;
        2)
            deploy_with_cache
            ;;
        3)
            deploy_with_nginx
            ;;
        4)
            deploy_complete
            ;;
        5)
            rebuild
            ;;
        6)
            stop_all
            ;;
        0)
            print_info "Saindo..."
            exit 0
            ;;
        *)
            print_error "Opção inválida"
            show_menu
            ;;
    esac
}

# Deploy básico
deploy_basic() {
    print_header
    print_info "🚀 Deploy Básico"
    
    check_docker
    create_directories
    check_env
    check_config
    cleanup_old
    build_images
    start_services
    wait_for_services
    check_status
    show_next_steps
}

# Deploy com Redis
deploy_with_cache() {
    print_header
    print_info "🚀 Deploy com Redis (cache)"
    
    check_docker
    create_directories
    check_env
    check_config
    cleanup_old
    build_images
    start_services "cache"
    wait_for_services
    check_status
    show_next_steps
}

# Deploy com Nginx
deploy_with_nginx() {
    print_header
    print_info "🚀 Deploy com Nginx (load balancer)"
    
    check_docker
    create_directories
    check_env
    check_config
    cleanup_old
    build_images
    start_services "production"
    wait_for_services
    check_status
    
    print_info "Nginx está servindo HLS em http://localhost/hls/"
    show_next_steps
}

# Deploy completo
deploy_complete() {
    print_header
    print_info "🚀 Deploy Completo (todos os serviços)"
    
    check_docker
    create_directories
    check_env
    check_config
    cleanup_old
    build_images
    
    # Iniciar com ambos os profiles
    docker compose --profile cache --profile production up -d
    
    wait_for_services
    check_status
    show_next_steps
}

# Rebuild
rebuild() {
    print_header
    print_info "🔨 Rebuild (sem cache)"
    
    cleanup_old
    
    docker compose build --no-cache --pull
    docker compose up -d
    
    wait_for_services
    check_status
    
    print_success "Rebuild concluído"
}

# Parar todos
stop_all() {
    print_header
    print_info "⏹️ Parando todos os serviços..."
    
    docker compose --profile cache --profile production down -v
    
    print_success "Todos os serviços parados"
}

# Main
main() {
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        echo "Uso: $0 [opção]"
        echo ""
        echo "Opções:"
        echo "  --basic       Deploy básico"
        echo "  --cache       Deploy com Redis"
        echo "  --nginx       Deploy com Nginx"
        echo "  --complete    Deploy completo"
        echo "  --rebuild     Rebuild sem cache"
        echo "  --stop        Parar serviços"
        echo "  --help        Mostrar ajuda"
        echo ""
        echo "Sem argumentos: Menu interativo"
        exit 0
    fi
    
    case "$1" in
        --basic)
            deploy_basic
            ;;
        --cache)
            deploy_with_cache
            ;;
        --nginx)
            deploy_with_nginx
            ;;
        --complete)
            deploy_complete
            ;;
        --rebuild)
            rebuild
            ;;
        --stop)
            stop_all
            ;;
        *)
            show_menu
            ;;
    esac
}

# Executar
main "$@"
