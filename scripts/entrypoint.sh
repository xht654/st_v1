#!/bin/bash
set -e

echo "🚀 Iniciando Stream Capture Multi-Sessão..."

# ==========================================
# CORRIGIR PERMISSÕES (rodando como root)
# ==========================================
echo "🔧 Configurando permissões..."

# Garantir que config.json é gravável
if [ -f "/app/config.json" ]; then
    chmod 666 /app/config.json
    echo "✅ config.json: permissões corrigidas (666)"
else
    echo "⚠️  config.json não encontrado"
fi

# Criar e dar permissões aos diretórios
mkdir -p /app/logs /app/timeshift /app/hls /tmp/vpn
chmod -R 777 /app/logs /app/timeshift /app/hls /tmp/vpn 2>/dev/null || true

echo "✅ Permissões configuradas"

# ==========================================
# VERIFICAR DEPENDÊNCIAS
# ==========================================
echo "🔍 Verificando dependências..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

if ! command -v streamlink &> /dev/null; then
    echo "❌ Streamlink não encontrado"
    exit 1
fi
echo "✅ Streamlink: $(streamlink --version | head -n1)"

if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg não encontrado"
    exit 1
fi
echo "✅ FFmpeg: $(ffmpeg -version | head -n1 | cut -d' ' -f3)"

if ! command -v google-chrome-stable &> /dev/null; then
    echo "⚠️  Google Chrome não encontrado"
else
    echo "✅ Google Chrome: $(google-chrome-stable --version | cut -d' ' -f3)"
fi

# ==========================================
# VERIFICAR VPN (se habilitada)
# ==========================================
if [ "$VPN_ENABLED" = "true" ]; then
    if ! command -v openvpn &> /dev/null; then
        echo "❌ OpenVPN não encontrado (necessário para VPN)"
        exit 1
    fi
    echo "✅ OpenVPN disponível"
    
    # Configurar TUN device
    echo "🌐 Configurando dispositivo TUN para VPN..."
    mkdir -p /dev/net
    if [ ! -c /dev/net/tun ]; then
        mknod /dev/net/tun c 10 200 2>/dev/null || true
        chmod 600 /dev/net/tun 2>/dev/null || true
    fi
fi

# ==========================================
# VERIFICAR CONFIGURAÇÃO
# ==========================================
echo "📋 Validando configuração..."

if [ -f "/app/config.json" ]; then
    echo "✅ Arquivo de configuração encontrado"
    
    # Verificar se é JSON válido
    if node -e "JSON.parse(require('fs').readFileSync('/app/config.json', 'utf8'))" 2>/dev/null; then
        echo "✅ config.json é válido"
    else
        echo "⚠️  config.json pode estar corrompido"
    fi
else
    echo "❌ Arquivo config.json não encontrado"
    exit 1
fi

# ==========================================
# AGUARDAR TVHEADEND
# ==========================================
if [ "$TVHEADEND_HOST" ]; then
    echo "⏳ Aguardando TVHeadend em $TVHEADEND_HOST:${TVHEADEND_PORT:-9982}..."
    
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s --connect-timeout 2 http://$TVHEADEND_HOST:9981 > /dev/null 2>&1; then
            echo "✅ TVHeadend disponível"
            break
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    
    if [ $attempt -eq $max_attempts ]; then
        echo "⚠️  TVHeadend não respondeu (continuando mesmo assim)"
    fi
fi

# ==========================================
# INFORMAÇÕES DO SISTEMA
# ==========================================
echo ""
echo "📊 Informações do Sistema:"
echo "  Node.js: $(node --version)"
echo "  NPM: $(npm --version)"
echo "  Streamlink: $(streamlink --version | head -n1)"
echo "  FFmpeg: $(ffmpeg -version | head -n1 | cut -d' ' -f3)"
echo "  Timezone: ${TZ:-UTC}"
echo "  Env: ${NODE_ENV:-development}"
echo ""

# ==========================================
# INICIALIZAÇÃO CONCLUÍDA
# ==========================================
echo "✅ Inicialização concluída com sucesso!"
echo "🎯 Executando: $@"
echo ""

# ==========================================
# EXECUTAR COMANDO PRINCIPAL
# ==========================================
exec "$@"
