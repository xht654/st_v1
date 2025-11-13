#!/bin/bash

# Stream Capture Multi-Sessão - Gestão de Configuração v2.0

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configurações
API_BASE="http://localhost:3001/api"
CONFIG_FILE="config.json"

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

# Verificar se API está disponível
check_api() {
    if ! curl -s "$API_BASE/status" >/dev/null 2>&1; then
        print_error "API não disponível em $API_BASE"
        print_info "Certifique-se de que o sistema está rodando: ./manage.sh start"
        exit 1
    fi
}

# Listar todos os sites
list_sites() {
    print_info "📋 Sites configurados:"
    
    if command -v jq >/dev/null 2>&1; then
        curl -s "$API_BASE/sites" | jq -r '
            to_entries[] | 
            "\(.key): \(.value.name) - \(if .value.enabled then "✅ Habilitado" else "❌ Desabilitado" end) - Método: \(.value.captureMethod // "advanced")"
        '
    else
        curl -s "$API_BASE/sites"
    fi
}

# Mostrar configuração completa
show_config() {
    print_info "📄 Configuração completa:"
    
    if command -v jq >/dev/null 2>&1; then
        curl -s "$API_BASE/config" | jq .
    else
        curl -s "$API_BASE/config"
    fi
}

# Habilitar site
enable_site() {
    local site_id="$1"
    if [ -z "$site_id" ]; then
        print_error "Uso: $0 enable <site_id>"
        list_sites
        exit 1
    fi
    
    print_info "✅ Habilitando site: $site_id"
    
    # Obter configuração atual do site
    local site_config=$(curl -s "$API_BASE/sites" | jq ".\"$site_id\"")
    
    if [ "$site_config" = "null" ]; then
        print_error "Site não encontrado: $site_id"
        exit 1
    fi
    
    # Atualizar enabled para true
    local updated_config=$(echo "$site_config" | jq '.enabled = true')
    
    # Enviar atualização
    local response=$(curl -s -X POST "$API_BASE/sites/$site_id" \
        -H "Content-Type: application/json" \
        -d "$updated_config")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Site $site_id habilitado com sucesso"
    else
        print_error "Falha ao habilitar site $site_id"
        echo "$response"
    fi
}

# Desabilitar site
disable_site() {
    local site_id="$1"
    if [ -z "$site_id" ]; then
        print_error "Uso: $0 disable <site_id>"
        list_sites
        exit 1
    fi
    
    print_info "❌ Desabilitando site: $site_id"
    
    # Obter configuração atual do site
    local site_config=$(curl -s "$API_BASE/sites" | jq ".\"$site_id\"")
    
    if [ "$site_config" = "null" ]; then
        print_error "Site não encontrado: $site_id"
        exit 1
    fi
    
    # Atualizar enabled para false
    local updated_config=$(echo "$site_config" | jq '.enabled = false')
    
    # Enviar atualização
    local response=$(curl -s -X POST "$API_BASE/sites/$site_id" \
        -H "Content-Type: application/json" \
        -d "$updated_config")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Site $site_id desabilitado com sucesso"
    else
        print_error "Falha ao desabilitar site $site_id"
        echo "$response"
    fi
}

# Adicionar novo site
add_site() {
    local name="$1"
    local url="$2"
    local method="${3:-advanced}"
    
    if [ -z "$name" ] || [ -z "$url" ]; then
        print_error "Uso: $0 add <nome> <url> [método]"
        print_info "Métodos disponíveis: simple, advanced (padrão)"
        exit 1
    fi
    
    print_info "➕ Adicionando site: $name"
    
    # Gerar ID do site
    local site_id=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')
    
    # Configuração do novo site
    local new_site='{
        "name": "'$name'",
        "url": "'$url'",
        "enabled": true,
        "captureMethod": "'$method'",
        "waitTime": 10000,
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "patterns": {
            "video": ["tracks-v1", "video", "v1"],
            "audio": ["tracks-a1", "audio", "a1"],
            "combined": ["index.m3u8", "playlist.m3u8", "master.m3u8"]
        },
        "adProtection": {
            "level": "medium"
        },
        "streamlink": {
            "quality": "best",
            "retryStreams": 3,
            "retryMax": 5
        }
    }'
    
    # Enviar para API
    local response=$(curl -s -X POST "$API_BASE/sites/$site_id" \
        -H "Content-Type: application/json" \
        -d "$new_site")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Site $name adicionado com ID: $site_id"
        print_info "Configure os padrões específicos via Web UI se necessário"
    else
        print_error "Falha ao adicionar site $name"
        echo "$response"
    fi
}

# Testar site específico
test_site() {
    local site_id="$1"
    if [ -z "$site_id" ]; then
        print_error "Uso: $0 test <site_id>"
        list_sites
        exit 1
    fi
    
    print_info "🧪 Testando site: $site_id"
    
    # Iniciar sessão de teste
    local response=$(curl -s -X POST "$API_BASE/sessions/$site_id/start")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Teste iniciado para $site_id"
        print_info "Acompanhe os logs: ./manage.sh logs"
        print_info "Veja o status: ./manage.sh sessions:list"
    else
        print_error "Falha ao iniciar teste para $site_id"
        echo "$response"
    fi
}

# Recarregar configuração
reload_config() {
    print_info "🔄 Recarregando configuração..."
    
    local response=$(curl -s -X POST "$API_BASE/reload")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Configuração recarregada com sucesso"
    else
        print_error "Falha ao recarregar configuração"
        echo "$response"
    fi
}

# Configurar ferramenta preferida
set_tool() {
    local tool="$1"
    if [ -z "$tool" ]; then
        print_error "Uso: $0 set-tool <streamlink|vlc|ffmpeg>"
        exit 1
    fi
    
    if [[ ! "$tool" =~ ^(streamlink|vlc|ffmpeg)$ ]]; then
        print_error "Ferramenta inválida. Use: streamlink, vlc ou ffmpeg"
        exit 1
    fi
    
    print_info "🔧 Definindo ferramenta preferida: $tool"
    
    # Obter configuração atual
    local config=$(curl -s "$API_BASE/config")
    
    # Atualizar ferramenta preferida
    local updated_config=$(echo "$config" | jq ".streaming.preferredTool = \"$tool\"")
    
    # Enviar atualização
    local response=$(curl -s -X POST "$API_BASE/config" \
        -H "Content-Type: application/json" \
        -d "$updated_config")
    
    if echo "$response" | grep -q '"success":true'; then
        print_success "Ferramenta preferida definida: $tool"
    else
        print_error "Falha ao definir ferramenta preferida"
        echo "$response"
    fi
}

# Status do sistema
system_status() {
    print_info "📊 Status do sistema:"
    
    if command -v jq >/dev/null 2>&1; then
        curl -s "$API_BASE/status" | jq '{
            api: .api,
            sessions: .sessions,
            vpn: .vpn
        }'
    else
        curl -s "$API_BASE/status"
    fi
}

# Configuração VPN
configure_vpn() {
    local action="$1"
    
    case "$action" in
        "enable")
            print_info "🔐 Habilitando VPN..."
            curl -s -X POST "$API_BASE/vpn/config" \
                -H "Content-Type: application/json" \
                -d '{"enabled": true}'
            ;;
        "disable")
            print_info "🔓 Desabilitando VPN..."
            curl -s -X POST "$API_BASE/vpn/config" \
                -H "Content-Type: application/json" \
                -d '{"enabled": false}'
            ;;
        "status")
            print_info "📡 Status VPN:"
            curl -s "$API_BASE/vpn/status" | jq .
            ;;
        "connect")
            print_info "🔌 Conectando VPN..."
            curl -s -X POST "$API_BASE/vpn/connect"
            ;;
        "disconnect")
            print_info "🔌 Desconectando VPN..."
            curl -s -X POST "$API_BASE/vpn/disconnect"
            ;;
        *)
            print_error "Uso: $0 vpn <enable|disable|status|connect|disconnect>"
            exit 1
            ;;
    esac
}

# Gestão de sessões
manage_sessions() {
    local action="$1"
    local site_id="$2"
    
    case "$action" in
        "list")
            print_info "📋 Sessões ativas:"
            curl -s "$API_BASE/sessions" | jq .
            ;;
        "start")
            if [ -z "$site_id" ]; then
                print_error "Uso: $0 sessions start <site_id>"
                exit 1
            fi
            print_info "▶️ Iniciando sessão: $site_id"
            curl -s -X POST "$API_BASE/sessions/$site_id/start"
            ;;
        "stop")
            if [ -z "$site_id" ]; then
                print_error "Uso: $0 sessions stop <site_id>"
                exit 1
            fi
            print_info "⏹️ Parando sessão: $site_id"
            curl -s -X POST "$API_BASE/sessions/$site_id/stop"
            ;;
        "parallel")
            print_info "🚀 Iniciando captura paralela..."
            curl -s -X POST "$API_BASE/sessions/start-parallel"
            ;;
        "stop-all")
            print_info "⏹️ Parando todas as sessões..."
            curl -s -X POST "$API_BASE/sessions/stop-all"
            ;;
        *)
            print_error "Uso: $0 sessions <list|start|stop|parallel|stop-all> [site_id]"
            exit 1
            ;;
    esac
}

# Backup e export
backup_export() {
    local action="$1"
    local filename="$2"
    
    case "$action" in
        "export")
            local filename="${filename:-config-export-$(date +%Y%m%d_%H%M%S).json}"
            print_info "📁 Exportando configuração para: $filename"
            curl -s "$API_BASE/config" > "$filename"
            print_success "Configuração exportada para $filename"
            ;;
        "import")
            if [ -z "$filename" ] || [ ! -f "$filename" ]; then
                print_error "Uso: $0 backup import <arquivo.json>"
                exit 1
            fi
            print_warning "⚠️ Isso irá sobrescrever a configuração atual!"
            read -p "Continuar? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_info "📁 Importando configuração de: $filename"
                curl -s -X POST "$API_BASE/config" \
                    -H "Content-Type: application/json" \
                    -d @"$filename"
                print_success "Configuração importada de $filename"
            else
                print_info "Operação cancelada"
            fi
            ;;
        *)
            print_error "Uso: $0 backup <export|import> [arquivo]"
            exit 1
            ;;
    esac
}

# Função de ajuda
show_help() {
    echo -e "${BLUE}Stream Capture Multi-Sessão - Gestão de Configuração v2.0${NC}"
    echo "=================================================================="
    echo ""
    echo -e "${YELLOW}SITES:${NC}"
    echo "  list                      - Listar todos os sites"
    echo "  enable <site>            - Habilitar site"
    echo "  disable <site>           - Desabilitar site"
    echo "  add <nome> <url> [método] - Adicionar novo site"
    echo "  test <site>              - Testar site específico"
    echo ""
    echo -e "${YELLOW}SISTEMA:${NC}"
    echo "  show                     - Mostrar configuração completa"
    echo "  status                   - Status do sistema"
    echo "  reload                   - Recarregar configuração"
    echo "  set-tool <tool>          - Definir ferramenta preferida"
    echo ""
    echo -e "${YELLOW}VPN:${NC}"
    echo "  vpn enable|disable       - Habilitar/desabilitar VPN"
    echo "  vpn status               - Status da VPN"
    echo "  vpn connect|disconnect   - Conectar/desconectar VPN"
    echo ""
    echo -e "${YELLOW}SESSÕES:${NC}"
    echo "  sessions list            - Listar sessões ativas"
    echo "  sessions start <site>    - Iniciar sessão específica"
    echo "  sessions stop <site>     - Parar sessão específica"
    echo "  sessions parallel        - Iniciar captura paralela"
    echo "  sessions stop-all        - Parar todas as sessões"
    echo ""
    echo -e "${YELLOW}BACKUP:${NC}"
    echo "  backup export [arquivo]  - Exportar configuração"
    echo "  backup import <arquivo>  - Importar configuração"
    echo ""
    echo -e "${YELLOW}Exemplos:${NC}"
    echo "  $0 list"
    echo "  $0 enable freeshot_dazn"
    echo "  $0 add \"Meu Site\" \"https://exemplo.com/stream\" simple"
    echo "  $0 sessions parallel"
    echo "  $0 vpn connect"
    echo "  $0 backup export"
}

# Função principal
main() {
    # Verificar API (exceto para help)
    if [[ "$1" != "help" && "$1" != "--help" && "$1" != "-h" && -n "$1" ]]; then
        check_api
    fi
    
    case "$1" in
        "list")
            list_sites
            ;;
        "show")
            show_config
            ;;
        "enable")
            enable_site "$2"
            ;;
        "disable")
            disable_site "$2"
            ;;
        "add")
            add_site "$2" "$3" "$4"
            ;;
        "test")
            test_site "$2"
            ;;
        "reload")
            reload_config
            ;;
        "set-tool")
            set_tool "$2"
            ;;
        "status")
            system_status
            ;;
        "vpn")
            configure_vpn "$2"
            ;;
        "sessions")
            manage_sessions "$2" "$3"
            ;;
        "backup")
            backup_export "$2" "$3"
            ;;
        "help"|"--help"|"-h"|"")
            show_help
            ;;
        *)
            print_error "Comando desconhecido: $1"
            show_help
            exit 1
            ;;
    esac
}

# Executar função principal
main "$@"

