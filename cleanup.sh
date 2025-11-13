#!/bin/bash

# Stream Capture - Script de Limpeza
# Remove pipes antigas e corrige permissões

set -e

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
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE} Stream Capture - Cleanup       ${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

# Verificar se está rodando
check_containers() {
    if docker ps --format '{{.Names}}' | grep -q "stream_capture\|tvheadend"; then
        print_warning "Containers ainda estão rodando!"
        read -p "Parar containers? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Parando containers..."
            docker-compose down
            print_success "Containers parados"
        else
            print_error "Operação cancelada. Pare os containers primeiro."
            exit 1
        fi
    fi
}

# Limpar pipes
cleanup_pipes() {
    print_info "Limpando pipes antigas..."
    
    local pipe_count=$(find tvheadend/timeshift -name "*.pipe" 2>/dev/null | wc -l)
    
    if [ "$pipe_count" -gt 0 ]; then
        print_warning "Encontradas $pipe_count pipes"
        
        # Tentar remover normalmente primeiro
        if rm -f tvheadend/timeshift/*.pipe 2>/dev/null; then
            print_success "Pipes removidas com sucesso"
        else
            # Se falhar, usar sudo
            print_warning "Necessário sudo para remover pipes..."
            if sudo rm -f tvheadend/timeshift/*.pipe; then
                print_success "Pipes removidas com sudo"
            else
                print_error "Falha ao remover pipes"
                return 1
            fi
        fi
    else
        print_info "Nenhuma pipe encontrada"
    fi
}

# Limpar arquivos M3U
cleanup_m3u() {
    print_info "Limpando arquivos M3U..."
    
    local m3u_count=$(find tvheadend/timeshift -name "*.m3u" 2>/dev/null | wc -l)
    
    if [ "$m3u_count" -gt 0 ]; then
        if rm -f tvheadend/timeshift/*.m3u 2>/dev/null; then
            print_success "$m3u_count arquivos M3U removidos"
        else
            sudo rm -f tvheadend/timeshift/*.m3u
            print_success "$m3u_count arquivos M3U removidos com sudo"
        fi
    else
        print_info "Nenhum arquivo M3U encontrado"
    fi
}

# Corrigir permissões
fix_permissions() {
    print_info "Corrigindo permissões..."
    
    # Verificar se precisa de sudo
    if [ ! -w tvheadend/timeshift ]; then
        print_warning "Necessário sudo para corrigir permissões..."
        
        # Mudar ownership para usuário atual
        if sudo chown -R $USER:$USER tvheadend/; then
            print_success "Ownership alterado para $USER"
        fi
        
        # Dar permissões adequadas
        if sudo chmod -R 755 tvheadend/; then
            print_success "Permissões corrigidas (755)"
        fi
        
        # Permissão especial para timeshift
        if sudo chmod 777 tvheadend/timeshift/; then
            print_success "Timeshift configurado (777)"
        fi
    else
        chmod -R 755 tvheadend/
        chmod 777 tvheadend/timeshift/
        print_success "Permissões corrigidas"
    fi
}

# Limpar logs antigos
cleanup_logs() {
    print_info "Limpando logs antigos (>7 dias)..."
    
    if [ -d "logs" ]; then
        local log_count=$(find logs -name "*.log" -mtime +7 2>/dev/null | wc -l)
        
        if [ "$log_count" -gt 0 ]; then
            find logs -name "*.log" -mtime +7 -delete
            print_success "$log_count logs antigos removidos"
        else
            print_info "Nenhum log antigo encontrado"
        fi
    fi
}

# Limpar volumes Docker órfãos
cleanup_docker_volumes() {
    print_info "Limpando volumes Docker órfãos..."
    
    local volumes=$(docker volume ls -qf dangling=true | wc -l)
    
    if [ "$volumes" -gt 0 ]; then
        if docker volume prune -f >/dev/null 2>&1; then
            print_success "$volumes volumes órfãos removidos"
        fi
    else
        print_info "Nenhum volume órfão encontrado"
    fi
}

# Verificar integridade
verify_structure() {
    print_info "Verificando estrutura de diretórios..."
    
    local dirs=("logs" "tvheadend/config" "tvheadend/timeshift" "tvheadend/recordings" "vpn")
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_warning "Criado diretório faltante: $dir"
        fi
    done
    
    print_success "Estrutura verificada"
}

# Mostrar estatísticas
show_stats() {
    echo ""
    print_info "📊 Estatísticas:"
    
    echo "  Pipes atuais:        $(find tvheadend/timeshift -name "*.pipe" 2>/dev/null | wc -l)"
    echo "  Arquivos M3U:        $(find tvheadend/timeshift -name "*.m3u" 2>/dev/null | wc -l)"
    echo "  Logs:                $(find logs -name "*.log" 2>/dev/null | wc -l)"
    echo "  Tamanho timeshift:   $(du -sh tvheadend/timeshift 2>/dev/null | cut -f1)"
    echo "  Permissões:          $(stat -c '%a' tvheadend/timeshift 2>/dev/null || echo 'N/A')"
    
    echo ""
}

# Menu interativo
show_menu() {
    print_header
    
    echo "Escolha uma opção:"
    echo ""
    echo "  1) Limpeza completa (recomendado)"
    echo "  2) Limpar apenas pipes"
    echo "  3) Corrigir permissões"
    echo "  4) Limpar logs antigos"
    echo "  5) Cleanup Docker"
    echo "  6) Mostrar estatísticas"
    echo "  0) Sair"
    echo ""
    read -p "Opção: " -n 1 -r option
    echo ""
    
    case $option in
        1)
            full_cleanup
            ;;
        2)
            check_containers
            cleanup_pipes
            cleanup_m3u
            ;;
        3)
            fix_permissions
            ;;
        4)
            cleanup_logs
            ;;
        5)
            cleanup_docker_volumes
            ;;
        6)
            show_stats
            read -p "Pressione Enter para voltar..."
            show_menu
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

# Limpeza completa
full_cleanup() {
    print_header
    print_warning "⚠️  LIMPEZA COMPLETA"
    echo ""
    echo "Isso irá:"
    echo "  - Parar containers (se rodando)"
    echo "  - Remover todas as pipes"
    echo "  - Remover arquivos M3U"
    echo "  - Corrigir permissões"
    echo "  - Limpar logs antigos"
    echo "  - Cleanup Docker"
    echo ""
    read -p "Continuar? (y/N) " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Operação cancelada"
        exit 0
    fi
    
    echo ""
    
    check_containers
    cleanup_pipes
    cleanup_m3u
    fix_permissions
    cleanup_logs
    cleanup_docker_volumes
    verify_structure
    
    echo ""
    print_success "🎉 Limpeza completa concluída!"
    show_stats
    
    echo ""
    print_info "Próximos passos:"
    echo "  1. ./manage.sh build"
    echo "  2. ./manage.sh start"
    echo ""
}

# Modo automático (sem interação)
auto_mode() {
    print_header
    print_info "Modo automático..."
    
    check_containers
    cleanup_pipes
    cleanup_m3u
    fix_permissions
    cleanup_logs
    verify_structure
    
    print_success "Cleanup automático concluído"
    show_stats
}

# Main
main() {
    # Verificar se está no diretório correto
    if [ ! -f "docker-compose.yml" ]; then
        print_error "Execute este script no diretório raiz do projeto"
        exit 1
    fi
    
    # Se passar argumento --auto, executa sem interação
    if [ "$1" = "--auto" ] || [ "$1" = "-a" ]; then
        auto_mode
    elif [ "$1" = "--full" ] || [ "$1" = "-f" ]; then
        full_cleanup
    elif [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        echo "Uso: $0 [opção]"
        echo ""
        echo "Opções:"
        echo "  -a, --auto    Limpeza automática (sem interação)"
        echo "  -f, --full    Limpeza completa (com confirmação)"
        echo "  -h, --help    Mostrar esta ajuda"
        echo ""
        echo "Sem argumentos: Menu interativo"
        exit 0
    else
        show_menu
    fi
}

# Executar
main "$@"
