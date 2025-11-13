#!/bin/bash

# Stream Capture Multi-Sessão - Script de Gestão
# Versão 2.0.0

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configurações
COMPOSE_FILE="docker-compose.yml"
PROJECT_NAME="stream-capture"
LOG_LINES=100

# Funções auxiliares
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE} Stream Capture Multi-Sessão    ${NC}"
    echo -e "${BLUE} Sistema de Gestão v2.0         ${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

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
    echo -e "${CYAN}ℹ️ $1${NC}"
}

# Verificar dependências
check_dependencies() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker não encontrado. Execute: ./install-deps.sh"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        print_error "Docker Compose não encontrado. Execute: ./install-deps.sh"
        exit 1
    fi
}

# Verificar se arquivo existe
check_file() {
    if [ ! -f "$1" ]; then
        print_error "Arquivo $1 não encontrado"
        exit 1
    fi
}

# Mostrar status dos serviços
show_status() {
    print_info "Status dos Serviços:"
    docker compose ps

    echo ""
    print_info "Status das Portas:"
    echo "Web UI:      http://localhost:3001"
    echo "API:         http://localhost:3000"
    echo "Streams:     http://localhost:8080"
    echo "TVHeadend:   http://localhost:9981"
    
    echo ""
    print_info "Verificando conectividade..."
    
    # Verificar Web UI
    if curl -s http://localhost:3001/api/status >/dev/null 2>&1; then
        print_success "Web UI: Online"
    else
        print_warning "Web UI: Offline"
    fi
    
    # Verificar TVHeadend
    if curl -s http://localhost:9981 >/dev/null 2>&1; then
        print_success "TVHeadend: Online"
    else
        print_warning "TVHeadend: Offline"
    fi
    
    # Verificar Stream Server
    if curl -s http://localhost:8080/status >/dev/null 2>&1; then
        print_success "Stream Server: Online"
    else
        print_warning "Stream Server: Offline"
    fi
}

# Mostrar informações detalhadas
show_info() {
    print_info "Informações do Sistema:"
    
    echo "Containers:"
    docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Status}}"
    
    echo ""
    echo "Recursos:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
    
    echo ""
    echo "Volumes:"
    docker volume ls | grep $PROJECT_NAME || echo "Nenhum volume específico encontrado"
    
    echo ""
    echo "Redes:"
    docker network ls | grep $PROJECT_NAME || echo "Rede padrão"
}

# Gestão de VPN
vpn_status() {
    print_info "Status da VPN:"
    if docker exec -it stream_capture curl -s http://localhost:3001/api/vpn/status 2>/dev/null; then
        echo ""
    else
        print_warning "Não foi possível obter status da VPN (container pode estar offline)"
    fi
}

vpn_connect() {
    print_info "Conectando VPN..."
    if docker exec -it stream_capture curl -X POST http://localhost:3001/api/vpn/connect 2>/dev/null; then
        print_success "Comando de conexão VPN enviado"
    else
        print_error "Falha ao enviar comando de conexão VPN"
    fi
}

vpn_disconnect() {
    print_info "Desconectando VPN..."
    if docker exec -it stream_capture curl -X POST http://localhost:3001/api/vpn/disconnect 2>/dev/null; then
        print_success "Comando de desconexão VPN enviado"
    else
        print_error "Falha ao enviar comando de desconexão VPN"
    fi
}

vpn_test() {
    print_info "Testando conectividade VPN..."
    docker exec -it stream_capture bash -c "
        echo 'IP antes da VPN:'
        curl -s https://api.ipify.org
        echo ''
        echo 'Testando VPN...'
        # Aqui seria feito o teste real da VPN
    "
}

# Gestão de sessões
sessions_list() {
    print_info "Sessões ativas:"
    if docker exec -it stream_capture curl -s http://localhost:3001/api/sessions 2>/dev/null | jq . 2>/dev/null; then
        echo ""
    else
        print_warning "Não foi possível obter lista de sessões (jq pode não estar instalado)"
        docker exec -it stream_capture curl -s http://localhost:3001/api/sessions 2>/dev/null || print_error "Container offline"
    fi
}

sessions_start() {
    local site_id="$1"
    if [ -z "$site_id" ]; then
        print_error "Uso: $0 sessions:start <site_id>"
        print_info "Sites disponíveis:"
        docker exec -it stream_capture curl -s http://localhost:3001/api/sites 2>/dev/null | jq -r 'keys[]' 2>/dev/null || echo "Não foi possível listar sites"
        return 1
    fi
    
    print_info "Iniciando sessão para: $site_id"
    docker exec -it stream_capture curl -X POST "http://localhost:3001/api/sessions/$site_id/start" 2>/dev/null
}

sessions_stop() {
    local site_id="$1"
    if [ -z "$site_id" ]; then
        print_error "Uso: $0 sessions:stop <site_id>"
        return 1
    fi
    
    print_info "Parando sessão para: $site_id"
    docker exec -it stream_capture curl -X POST "http://localhost:3001/api/sessions/$site_id/stop" 2>/dev/null
}

sessions_parallel() {
    print_info "Iniciando captura paralela de todos os sites habilitados..."
    docker exec -it stream_capture curl -X POST http://localhost:3001/api/sessions/start-parallel 2>/dev/null
}

sessions_stop_all() {
    print_info "Parando todas as sessões..."
    docker exec -it stream_capture curl -X POST http://localhost:3001/api/sessions/stop-all 2>/dev/null
}

# Gestão de configuração
config_show() {
    print_info "Configuração atual:"
    if [ -f "config.json" ]; then
        cat config.json | jq . 2>/dev/null || cat config.json
    else
        print_error "Arquivo config.json não encontrado"
    fi
}

config_backup() {
    local backup_name="config.backup.$(date +%Y%m%d_%H%M%S).json"
    if [ -f "config.json" ]; then
        cp config.json "$backup_name"
        print_success "Backup criado: $backup_name"
    else
        print_error "Arquivo config.json não encontrado"
    fi
}

config_validate() {
    print_info "Validando configuração..."
    if docker exec -it stream_capture node scripts/validate-config.js 2>/dev/null; then
        print_success "Configuração válida"
    else
        print_error "Configuração inválida"
    fi
}

config_reload() {
    print_info "Recarregando configuração..."
    if docker exec -it stream_capture curl -X POST http://localhost:3001/api/reload 2>/dev/null; then
        print_success "Configuração recarregada"
    else
        print_error "Falha ao recarregar configuração"
    fi
}

# Monitoramento e logs
logs_tail() {
    local service="$1"
    local lines="${2:-$LOG_LINES}"
    
    if [ -z "$service" ]; then
        print_info "Logs de todos os serviços (últimas $lines linhas):"
        docker compose logs --tail="$lines" -f
    else
        print_info "Logs do serviço $service (últimas $lines linhas):"
        docker compose logs --tail="$lines" -f "$service"
    fi
}

logs_search() {
    local term="$1"
    if [ -z "$term" ]; then
        print_error "Uso: $0 logs:search <termo>"
        return 1
    fi
    
    print_info "Procurando por: $term"
    docker compose logs | grep -i "$term" --color=always
}

logs_errors() {
    print_info "Últimos erros encontrados:"
    docker compose logs | grep -i "error\|fail\|exception" --color=always | tail -20
}

logs_clean() {
    print_info "Limpando logs antigos..."
    
    # Limpar logs do Docker
    docker system prune -f >/dev/null 2>&1
    
    # Limpar logs de arquivos (se houver)
    if [ -d "logs" ]; then
        find logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
        print_success "Logs antigos removidos"
    fi
}

# Monitoramento em tempo real
monitor() {
    print_info "Monitor em tempo real (Ctrl+C para sair):"
    
    while true; do
        clear
        print_header
        
        # Status básico
        echo -e "${YELLOW}Status dos Containers:${NC}"
        docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Status}}"
        
        echo ""
        echo -e "${YELLOW}Recursos:${NC}"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
        
        echo ""
        echo -e "${YELLOW}Sessões Ativas:${NC}"
        docker exec stream_capture curl -s http://localhost:3001/api/sessions 2>/dev/null | jq -r 'to_entries[] | select(.value.isRunning == true) | "\(.key): \(.value.status)"' 2>/dev/null || echo "Não foi possível obter sessões"
        
        echo ""
        echo -e "${YELLOW}Status VPN:${NC}"
        docker exec stream_capture curl -s http://localhost:3001/api/vpn/status 2>/dev/null | jq -r '"Habilitada: \(.enabled) | Conectada: \(.connected)"' 2>/dev/null || echo "VPN: Status indisponível"
        
        echo ""
        echo -e "${CYAN}Atualizado: $(date)${NC}"
        echo -e "${CYAN}Pressione Ctrl+C para sair${NC}"
        
        sleep 5
    done
}

# Backup e restore
backup_create() {
    local backup_name="backup_$(date +%Y%m%d_%H%M%S)"
    local backup_dir="backups/$backup_name"
    
    print_info "Criando backup completo..."
    
    mkdir -p "$backup_dir"
    
    # Backup da configuração
    cp config.json "$backup_dir/" 2>/dev/null || print_warning "config.json não encontrado"
    cp .env "$backup_dir/" 2>/dev/null || print_warning ".env não encontrado"
    cp docker-compose.yml "$backup_dir/" 2>/dev/null
    
    # Backup de logs importantes
    if [ -d "logs" ]; then
        cp -r logs "$backup_dir/" 2>/dev/null || true
    fi
    
    # Backup de configurações TVHeadend (apenas estrutura)
    if [ -d "tvheadend/config" ]; then
        mkdir -p "$backup_dir/tvheadend"
        tar -czf "$backup_dir/tvheadend/config.tar.gz" tvheadend/config/ 2>/dev/null || true
    fi
    
    # Criar arquivo de informações
    cat > "$backup_dir/info.txt" << EOF
Backup criado em: $(date)
Versão: 2.0.0
Sistema: $(uname -a)
Docker: $(docker --version)
Docker Compose: $(docker compose --version)
EOF
    
    print_success "Backup criado em: $backup_dir"
}

backup_list() {
    print_info "Backups disponíveis:"
    if [ -d "backups" ]; then
        ls -la backups/
    else
        print_warning "Diretório de backups não encontrado"
    fi
}

backup_restore() {
    local backup_name="$1"
    if [ -z "$backup_name" ]; then
        print_error "Uso: $0 backup:restore <nome_do_backup>"
        backup_list
        return 1
    fi
    
    local backup_dir="backups/$backup_name"
    if [ ! -d "$backup_dir" ]; then
        print_error "Backup não encontrado: $backup_dir"
        return 1
    fi
    
    print_warning "ATENÇÃO: Isso irá sobrescrever a configuração atual!"
    read -p "Continuar? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Operação cancelada"
        return 0
    fi
    
    print_info "Restaurando backup: $backup_name"
    
    # Parar serviços
    docker compose down
    
    # Restaurar arquivos
    cp "$backup_dir/config.json" . 2>/dev/null || print_warning "config.json não restaurado"
    cp "$backup_dir/.env" . 2>/dev/null || print_warning ".env não restaurado"
    
    # Restaurar TVHeadend se existir
    if [ -f "$backup_dir/tvheadend/config.tar.gz" ]; then
        tar -xzf "$backup_dir/tvheadend/config.tar.gz" 2>/dev/null || true
    fi
    
    print_success "Backup restaurado. Execute '$0 start' para reiniciar os serviços"
}

# Manutenção
maintenance_cleanup() {
    print_info "Executando limpeza geral..."
    
    # Parar containers
    docker compose down
    
    # Limpar containers parados
    docker container prune -f
    
    # Limpar imagens não utilizadas
    docker image prune -f
    
    # Limpar volumes não utilizados
    docker volume prune -f
    
    # Limpar redes não utilizadas
    docker network prune -f
    
    # Limpar logs antigos
    logs_clean
    
    print_success "Limpeza concluída"
}

maintenance_update() {
    print_info "Atualizando sistema..."
    
    # Fazer backup antes da atualização
    backup_create
    
    # Parar serviços
    docker compose down
    
    # Atualizar imagens
    docker compose pull
    
    # Rebuild containers
    docker compose build --pull --no-cache
    
    # Iniciar serviços
    docker compose up -d
    
    print_success "Atualização concluída"
}

maintenance_reset() {
    print_warning "ATENÇÃO: Isso irá remover TODOS os dados!"
    read -p "Tem certeza que deseja continuar? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Operação cancelada"
        return 0
    fi
    
    print_info "Resetando sistema..."
    
    # Parar e remover tudo
    docker compose down -v --remove-orphans
    
    # Remover imagens do projeto
    docker images | grep $PROJECT_NAME | awk '{print $3}' | xargs docker rmi -f 2>/dev/null || true
    
    # Limpar volumes
    docker volume ls | grep $PROJECT_NAME | awk '{print $2}' | xargs docker volume rm 2>/dev/null || true
    
    # Limpar diretórios de dados
    rm -rf tvheadend/config/* 2>/dev/null || true
    rm -rf tvheadend/recordings/* 2>/dev/null || true
    rm -rf tvheadend/timeshift/* 2>/dev/null || true
    rm -rf logs/* 2>/dev/null || true
    
    print_success "Sistema resetado. Execute '$0 setup' para reconfigurar"
}

# Setup inicial
setup() {
    print_header
    print_info "Configuração inicial do Stream Capture Multi-Sessão"
    
    # Verificar dependências
    check_dependencies
    
    # Executar script de setup
    if [ -f "scripts/setup.js" ]; then
        node scripts/setup.js
    else
        print_warning "Script de setup não encontrado, continuando..."
    fi
    
    # Verificar arquivos necessários
    check_file "config.json"
    check_file "docker-compose.yml"
    
    # Criar diretórios se não existirem
    mkdir -p logs tvheadend/{config,recordings,timeshift} vpn backups
    
    # Construir e iniciar
    print_info "Construindo containers..."
    docker compose build
    
    print_info "Iniciando serviços..."
    docker compose up -d
    
    # Aguardar inicialização
    print_info "Aguardando inicialização..."
    sleep 10
    
    # Mostrar status
    show_status
    
    print_success "Setup concluído!"
    print_info "Acesse a interface web em: http://localhost:3001"
}

# Função de ajuda
show_help() {
    print_header
    
    echo -e "${YELLOW}Uso: $0 {comando}${NC}\n"
    
    echo -e "${CYAN}=== SERVIÇOS BÁSICOS ===${NC}"
    echo "  setup           - Configuração inicial completa"
    echo "  start           - Iniciar todos os serviços"
    echo "  stop            - Parar todos os serviços"
    echo "  restart         - Reiniciar todos os serviços"
    echo "  status          - Ver status dos serviços"
    echo "  info            - Informações detalhadas do sistema"
    echo ""
    
    echo -e "${CYAN}=== GESTÃO VPN ===${NC}"
    echo "  vpn:status      - Status da conexão VPN"
    echo "  vpn:connect     - Conectar VPN"
    echo "  vpn:disconnect  - Desconectar VPN"
    echo "  vpn:test        - Testar conectividade VPN"
    echo ""
    
    echo -e "${CYAN}=== GESTÃO DE SESSÕES ===${NC}"
    echo "  sessions:list           - Listar sessões ativas"
    echo "  sessions:start <site>   - Iniciar sessão específica"
    echo "  sessions:stop <site>    - Parar sessão específica"
    echo "  sessions:parallel       - Iniciar captura paralela"
    echo "  sessions:stop-all       - Parar todas as sessões"
    echo ""
    
    echo -e "${CYAN}=== CONFIGURAÇÃO ===${NC}"
    echo "  config:show     - Mostrar configuração atual"
    echo "  config:backup   - Fazer backup da configuração"
    echo "  config:validate - Validar configuração"
    echo "  config:reload   - Recarregar configuração"
    echo ""
    
    echo -e "${CYAN}=== LOGS E MONITORAMENTO ===${NC}"
    echo "  logs [serviço] [linhas]  - Ver logs em tempo real"
    echo "  logs:search <termo>      - Procurar nos logs"
    echo "  logs:errors             - Ver últimos erros"
    echo "  logs:clean              - Limpar logs antigos"
    echo "  monitor                 - Monitor em tempo real"
    echo ""
    
    echo -e "${CYAN}=== BACKUP E RESTORE ===${NC}"
    echo "  backup:create           - Criar backup completo"
    echo "  backup:list             - Listar backups"
    echo "  backup:restore <nome>   - Restaurar backup"
    echo ""
    
    echo -e "${CYAN}=== MANUTENÇÃO ===${NC}"
    echo "  maintenance:cleanup     - Limpeza geral do sistema"
    echo "  maintenance:update      - Atualizar sistema"
    echo "  maintenance:reset       - Reset completo (CUIDADO!)"
    echo ""
    
    echo -e "${CYAN}=== DESENVOLVIMENTO ===${NC}"
    echo "  shell           - Entrar no container principal"
    echo "  shell:tv        - Entrar no container TVHeadend"
    echo "  build           - Construir containers"
    echo "  build:clean     - Construir sem cache"
    echo "  dev             - Modo desenvolvimento"
    echo ""
    
    echo -e "${CYAN}=== ACESSO RÁPIDO ===${NC}"
    echo "  web             - Abrir interface web"
    echo "  tvheadend       - Abrir TVHeadend"
    echo ""
    
    echo -e "${YELLOW}Exemplos:${NC}"
    echo "  $0 setup                    # Configuração inicial"
    echo "  $0 sessions:start freeshot_dazn"
    echo "  $0 logs stream-capture 50"
    echo "  $0 backup:create"
    echo "  $0 vpn:connect"
}

# Função principal
main() {
    case "$1" in
        # Serviços básicos
        "setup")
            setup
            ;;
        "start")
            print_info "Iniciando serviços..."
            docker compose up -d
            sleep 5
            show_status
            ;;
        "stop")
            print_info "Parando serviços..."
            docker compose down
            ;;
        "restart")
            print_info "Reiniciando serviços..."
            docker compose restart
            sleep 5
            show_status
            ;;
        "status")
            show_status
            ;;
        "info")
            show_info
            ;;
        
        # VPN
        "vpn:status")
            vpn_status
            ;;
        "vpn:connect")
            vpn_connect
            ;;
        "vpn:disconnect")
            vpn_disconnect
            ;;
        "vpn:test")
            vpn_test
            ;;
        
        # Sessões
        "sessions:list")
            sessions_list
            ;;
        "sessions:start")
            sessions_start "$2"
            ;;
        "sessions:stop")
            sessions_stop "$2"
            ;;
        "sessions:parallel")
            sessions_parallel
            ;;
        "sessions:stop-all")
            sessions_stop_all
            ;;
        
        # Configuração
        "config:show")
            config_show
            ;;
        "config:backup")
            config_backup
            ;;
        "config:validate")
            config_validate
            ;;
        "config:reload")
            config_reload
            ;;
        
        # Logs
        "logs")
            logs_tail "$2" "$3"
            ;;
        "logs:search")
            logs_search "$2"
            ;;
        "logs:errors")
            logs_errors
            ;;
        "logs:clean")
            logs_clean
            ;;
        "monitor")
            monitor
            ;;
        
        # Backup
        "backup:create")
            backup_create
            ;;
        "backup:list")
            backup_list
            ;;
        "backup:restore")
            backup_restore "$2"
            ;;
        
        # Manutenção
        "maintenance:cleanup")
            maintenance_cleanup
            ;;
        "maintenance:update")
            maintenance_update
            ;;
        "maintenance:reset")
            maintenance_reset
            ;;
        
        # Desenvolvimento
        "shell")
            print_info "Entrando no container stream-capture..."
            docker compose exec stream-capture /bin/bash
            ;;
        "shell:tv")
            print_info "Entrando no container tvheadend..."
            docker compose exec tvheadend /bin/bash
            ;;
        "build")
            print_info "Construindo containers..."
            docker compose build
            ;;
        "build:clean")
            print_info "Construindo containers sem cache..."
            docker compose build --no-cache
            ;;
        "dev")
            print_info "Iniciando modo desenvolvimento..."
            docker compose -f docker-compose.yml -f docker compose.dev.yml up
            ;;
        
        # Acesso rápido
        "web")
            print_info "Abrindo interface web..."
            if command -v xdg-open &> /dev/null; then
                xdg-open http://localhost:3001
            elif command -v open &> /dev/null; then
                open http://localhost:3001
            else
                print_info "Acesse: http://localhost:3001"
            fi
            ;;
        "tvheadend")
            print_info "Abrindo TVHeadend..."
            if command -v xdg-open &> /dev/null; then
                xdg-open http://localhost:9981
            elif command -v open &> /dev/null; then
                open http://localhost:9981
            else
                print_info "Acesse: http://localhost:9981"
            fi
            ;;
        
        # Comandos legados (compatibilidade)
        "logs-all")
            logs_tail "" "$2"
            ;;
        "logs-tv")
            logs_tail "tvheadend" "$2"
            ;;
        "clean")
            maintenance_cleanup
            ;;
        "update")
            maintenance_update
            ;;
        
        *)
            show_help
            exit 1
            ;;
    esac
}

# Verificar dependências básicas na inicialização
if [[ "$1" != "setup" ]]; then
    check_dependencies
fi

# Executar função principal
main "$@"

