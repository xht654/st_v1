# Dockerfile - Stream Capture Multi-Sessão v2.0 HLS
FROM node:18-slim

# ==========================================
# Instalar dependências do sistema
# ==========================================
RUN apt-get update && apt-get install -y \
    wget curl gnupg ca-certificates software-properties-common \
    fonts-liberation libasound2 libatk-bridge2.0-0 libdrm2 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libgconf-2-4 \
    python3 python3-pip ffmpeg vlc-bin vlc-plugin-base \
    openvpn iptables net-tools iproute2 dnsutils \
    procps htop nano netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Instalar Google Chrome
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Instalar Streamlink
RUN pip3 install --break-system-packages --no-cache-dir streamlink==6.5.1 \
    && streamlink --version

# Verificar FFmpeg
RUN ffmpeg -version && echo "✅ FFmpeg instalado com sucesso"

# ==========================================
# WORKDIR
# ==========================================
WORKDIR /app

# Copiar package.json e instalar deps
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copiar código
COPY src/ ./src/
COPY web/ ./web/
COPY index.js ./

# ==========================================
# CRÍTICO: Criar diretórios (SEM chown)
# ==========================================
RUN mkdir -p \
    /app/logs \
    /app/timeshift \
    /app/hls \
    /app/vpn \
    /tmp/vpn

# ==========================================
# Variáveis de ambiente
# ==========================================
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production
ENV PATH="/usr/bin:${PATH}"

# Script de inicialização
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/api/status || exit 1

# Expor portas
EXPOSE 3000 3001 8080 8081

# Volume mount points
VOLUME ["/app/logs", "/app/hls", "/app/timeshift"]

# Labels
LABEL maintainer="Stream Capture Team"
LABEL version="2.0-HLS"
LABEL description="Stream Capture with Streamlink + FFmpeg + HLS"

# ==========================================
# EXECUTAR COMO ROOT (para VPN funcionar)
# ==========================================
# Não definir USER - roda como root

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "index.js"]
