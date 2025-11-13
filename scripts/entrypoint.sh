#!/bin/bash
set -e

echo "🚀 Iniciando Stream Capture Multi-Sessão..."

# Configurar permissões
chown -R appuser:appuser /app/logs /app/timeshift /app/hls 2>/dev/null || true

# Verificar dependências
echo "🔍 Verificando dependências..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado"
    exit 1
fi

# Verificar Streamlink
if ! command -v streamlink &> /dev/null; then
    echo "❌ Streamlink não encontrado"
    exit 1
fi

# Verificar FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg não encontrado"
    exit 1
fi

# Verificar Google Chrome
if ! command -v google-chrome-stable &> /dev/null; then
    echo "❌ Google Chrome não encontrado"
    exit 1
fi

# Verificar OpenVPN (se VPN habilitada)
if [ "$VPN_ENABLED" = "true" ]; then
    if ! command -v openvpn &> /dev/null; then
        echo "❌ OpenVPN não encontrado (necessário para VPN)"
        exit 1
    fi
    echo "✅ OpenVPN disponível"
fi

# Configurar TUN device para VPN
if [ "$VPN_ENABLED" = "true" ]; then
    echo "🌐 Configurando dispositivo TUN para VPN..."
    mkdir -p /dev/net
    if [ ! -c /dev/net/tun ]; then
        mknod /dev/net/tun c 10 200
        chmod 600 /dev/net/tun
    fi
fi

# Validar configuração
echo "📋 Validando configuração..."
if [ -f "/app/config.json" ]; then
    echo "✅ Arquivo de configuração encontrado"
else
    echo "❌ Arquivo config.json não encontrado"
    exit 1
fi

# Configurar variáveis de ambiente padrão
export NODE_ENV=${NODE_ENV:-production}
export DEBUG=${DEBUG:-false}
export TZ=${TZ:-Europe/Lisbon}

# Configurar timezone
if [ "$TZ" ]; then
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime
    echo $TZ > /etc/timezone
fi

# Criar diretórios necessários
mkdir -p /app/logs /app/timeshift /app/hls /tmp/vpn

# Aguardar TVHeadend se necessário
if [ "$TVHEADEND_HOST" ]; then
    echo "⏳ Aguardando TVHeadend em $TVHEADEND_HOST:${TVHEADEND_PORT:-9982}..."
    
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        # Usar curl em vez de nc
        if curl -s --connect-timeout 2 http://$TVHEADEND_HOST:9981 > /dev/null 2>&1; then
            echo "✅ TVHeadend disponível"
            break
        fi
        
        attempt=$((attempt + 1))
        sleep 2
    done
    
    if [ $attempt -eq $max_attempts ]; then
        echo "⚠️ TVHeadend não respondeu (continuando mesmo assim)"
    fi
fi

echo "✅ Inicialização concluída"
echo "🎯 Executando: $@"

# Executar comando principal
exec "$@"
