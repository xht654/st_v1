// src/streaming/HTTPServer.js (MODIFICADO para HLS)
import express from 'express';
import path from 'path';
import Logger from '../utils/Logger.js';

export default class HTTPServer {
  constructor(sessionManager, configManager) {
    this.sessionManager = sessionManager;
    this.configManager = configManager;
    this.logger = new Logger('HTTPServer');
    this.app = express();
    this.server = null;
    this.port = 8080;
    this.hlsDir = '/app/hls'; // Diretório dos arquivos HLS
  }

  async start() {
    this.setupMiddleware();
    this.setupRoutes();
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        this.logger.info(`🌐 Servidor HTTP HLS ativo na porta ${this.port}`);
        this.logger.info(`📡 HLS disponível em: http://stream-capture:${this.port}/hls/<site_id>/stream.m3u8`);
        resolve();
      });
      
      this.server.on('error', reject);
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('⏹️ Servidor HTTP parado');
          resolve();
        });
      });
    }
  }

  setupMiddleware() {
    this.app.use(express.json());
    
    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // Log de requisições
    this.app.use((req, res, next) => {
      this.logger.debug(`📥 ${req.method} ${req.url} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // ✅ NOVO: Servir arquivos HLS estáticos
    this.app.use('/hls', express.static(this.hlsDir, {
      setHeaders: (res, path) => {
        if (path.endsWith('.m3u8')) {
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (path.endsWith('.ts')) {
          res.setHeader('Content-Type', 'video/mp2t');
          res.setHeader('Cache-Control', 'public, max-age=60');
        }
      }
    }));

    // ROTA: Status de um stream específico
    this.app.get('/:siteId/status', (req, res) => {
      const { siteId } = req.params;
      const session = this.sessionManager.activeSessions.get(siteId);
      
      if (!session) {
        res.status(404).json({ error: 'Sessão não encontrada' });
        return;
      }
      
      const baseUrl = this.getBaseUrl(req);
      
      res.json({
        siteId,
        siteName: session.site.name,
        isRunning: session.isRunning,
        status: session.status,
        uptime: session.startTime ? Date.now() - session.startTime : 0,
        restartCount: session.restartCount,
        // ✅ URLs HLS
        hlsPlaylist: `${baseUrl}/hls/${siteId}/stream.m3u8`,
        hlsDir: `/hls/${siteId}/`,
        // Stats
        ffmpegStats: session.ffmpegStats || null,
        hlsInfo: session.hlsInfo || null
      });
    });

    // ROTA: Status global do servidor
    this.app.get('/status', (req, res) => {
      const baseUrl = this.getBaseUrl(req);
      const sessions = this.sessionManager.getSessionsStatus();
      const activeSessions = Object.values(sessions).filter(s => s.isRunning);
      
      const streamDetails = {};
      for (const [siteId, session] of this.sessionManager.activeSessions) {
        if (session.isRunning && session.hlsInfo) {
          streamDetails[siteId] = {
            name: session.site.name,
            hlsPlaylist: `${baseUrl}/hls/${siteId}/stream.m3u8`,
            hlsDir: `/hls/${siteId}/`,
            stats: session.ffmpegStats || {}
          };
        }
      }
      
      res.json({
        server: 'HTTP HLS Stream Server',
        version: '2.0-HLS',
        port: this.port,
        totalSessions: Object.keys(sessions).length,
        activeSessions: activeSessions.length,
        streams: streamDetails,
        timestamp: new Date().toISOString()
      });
    });

    // ROTA: Lista todos os streams (HLS)
    this.app.get('/streams', (req, res) => {
      const baseUrl = this.getBaseUrl(req);
      const sessions = this.sessionManager.getSessionsStatus();
      const streams = {};
      
      for (const [siteId, session] of Object.entries(sessions)) {
        if (session.isRunning && session.hlsInfo) {
          streams[siteId] = {
            name: session.siteName,
            hlsPlaylist: `${baseUrl}/hls/${siteId}/stream.m3u8`,
            status: session.status,
            uptime: session.uptime,
            segmentCount: session.ffmpegStats?.segmentCount || 0
          };
        }
      }
      
      res.json(streams);
    });

    // ROTA: Playlist M3U para TVHeadend/IPTV
    this.app.get('/playlist.m3u', (req, res) => {
      const baseUrl = this.getBaseUrl(req);
      const sessions = this.sessionManager.getSessionsStatus();
      
      let m3uContent = '#EXTM3U\n';
      
      for (const [siteId, session] of Object.entries(sessions)) {
        if (session.isRunning && session.hlsInfo) {
          m3uContent += `#EXTINF:-1 tvg-id="${siteId}" tvg-name="${session.siteName}" group-title="Live Streams",${session.siteName}\n`;
          m3uContent += `${baseUrl}/hls/${siteId}/stream.m3u8\n`;
        }
      }
      
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(m3uContent);
    });

    // ROTA: Root (informações do servidor)
    this.app.get('/', (req, res) => {
      const baseUrl = this.getBaseUrl(req);
      
      res.json({
        server: 'Stream Capture HTTP HLS Server',
        version: '2.0-HLS',
        description: 'Streamlink → Pipe → FFmpeg → HLS',
        port: this.port,
        endpoints: {
          hls: '/hls/:siteId/stream.m3u8 (HLS playlist)',
          status: '/status (server status)',
          streams: '/streams (list all streams)',
          playlist: '/playlist.m3u (M3U playlist)',
          health: '/health (health check)'
        },
        usage: {
          vlc: `vlc ${baseUrl}/hls/<site_id>/stream.m3u8`,
          tvheadend: `${baseUrl}/playlist.m3u`,
          browser: `${baseUrl}/hls/<site_id>/stream.m3u8`,
          curl: `curl ${baseUrl}/streams`
        },
        advantages: {
          hls: 'Standard HLS protocol',
          compatibility: 'Works with all players',
          segments: 'Automatic segmentation',
          dvr: 'Built-in timeshift support',
          multiClient: 'Unlimited concurrent clients'
        }
      });
    });

    // ROTA: Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'Endpoint não encontrado',
        availableEndpoints: [
          '/hls/:siteId/stream.m3u8',
          '/status',
          '/streams',
          '/playlist.m3u',
          '/health'
        ]
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      this.logger.error(`❌ Erro no servidor HTTP: ${err.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }

  getBaseUrl(req) {
    const host = req.get('host') || `localhost:${this.port}`;
    const protocol = req.protocol || 'http';
    return `${protocol}://${host}`;
  }
}
