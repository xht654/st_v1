// src/sites/CaptureSession.js - ATUALIZADO COM BYPASS DE CAPTURA
import EventEmitter from 'events';
import fs from 'fs';
import StreamDetector from '../core/StreamDetector.js';
import StreamlinkManager from '../streaming/StreamlinkManager.js';
import FFmpegHLSManager from '../streaming/FFmpegHLSManager.js';
import TVHeadendIntegration from '../streaming/TVHeadendIntegration.js';
import Logger from '../utils/Logger.js';

export default class CaptureSession extends EventEmitter {
  constructor(site, configManager) {
    super();
    this.site = site;
    this.configManager = configManager;
    this.logger = new Logger(`Session:${site.id}`);
    
    this.streamDetector = new StreamDetector(site);
    this.streamlinkManager = new StreamlinkManager();
    this.ffmpegHLSManager = new FFmpegHLSManager();
    this.tvheadend = new TVHeadendIntegration(configManager);
    
    this.status = 'idle';
    this.startTime = null;
    this.currentStream = null;
    this.currentPipePath = null;
    this.streamlinkProcessId = null;
    this.ffmpegProcessId = null;
    this.hlsInfo = null;
    this.restartCount = 0;
    this.isRunning = false;
    this.healthCheckInterval = null;
  }

  async start() {
    if (this.isRunning) {
      throw new Error(`Sessão ${this.site.id} já está em execução`);
    }

    this.isRunning = true;
    this.status = 'starting';
    this.startTime = Date.now();
    
    this.logger.info(`🚀 Iniciando sessão para ${this.site.name}`);
    
    try {
      // ✅ NOVO: Verificar se deve fazer BYPASS de captura
      if (this.site.bypassCapture && this.site.directStreamUrl) {
        this.logger.info(`⚡ BYPASS ATIVADO - Pulando detecção de streams`);
        await this.startWithDirectUrl();
      } else {
        await this.startWithDetection();
      }

      // 6. CRIAR CANAIS TVHEADEND
      await this.setupTVHeadendChannel();

      // 7. INICIAR MONITORAMENTO
      this.startHealthCheck();

      this.emit('streamFound', {
        site: this.site,
        stream: this.currentStream,
        sessionId: this.getSessionId(),
        pipePath: this.currentPipePath,
        hlsPlaylist: this.hlsInfo?.playlistUrl
      });

      this.logger.info('✅ Sessão iniciada com sucesso');
      return true;

    } catch (error) {
      this.status = 'error';
      this.isRunning = false;
      this.logger.error(`❌ Erro ao iniciar sessão: ${error.message}`);
      
      // Cleanup em caso de erro
      await this.cleanup();
      
      this.emit('error', error);
      throw error;
    }
  }

  // ✅ NOVO: Iniciar com URL direto (BYPASS)
  async startWithDirectUrl() {
    this.logger.info(`📡 Usando URL direto (BYPASS): ${this.site.directStreamUrl}`);
    
    // Criar stream object artificial
    this.currentStream = {
      type: 'direct',
      url: this.site.directStreamUrl,
      quality: 'best',
      bypassMode: true
    };
    
    this.logger.info(`✅ Stream direto configurado`);
    
    // 3. CRIAR PIPE
    this.currentPipePath = this.getPipePath();
    this.logger.info(`✅ Pipe criada: ${this.currentPipePath}`);
    
    // 4. Espera antes do FFmpeg
    await new Promise(res => setTimeout(res, 5000));
    
    // 5. INICIAR FFMPEG HLS
    this.status = 'streaming';
    this.logger.info(`🎬 Iniciando FFmpeg HLS...`);
    await this.startFFmpegHLS();
    
    // 6. INICIAR STREAMLINK (com URL direto)
    this.logger.info(`📡 Iniciando Streamlink com URL direto...`);
    this.startStreamlink();
  }

  // Iniciar com detecção normal de streams
  async startWithDetection() {
    // 1. DETECTAR STREAMS
    this.status = 'detecting';
    this.logger.info('🔍 Detectando streams...');
    
    const streams = await this.streamDetector.detectStreams();
    
    if (!streams || (!streams.video && !streams.audio && streams.combined.length === 0)) {
      throw new Error('❌ Nenhum stream detectado');
    }

    this.logger.info(`✅ Streams detectados: V:${!!streams.video} A:${!!streams.audio} C:${streams.combined.length}`);

    // 2. SELECIONAR MELHOR STREAM
    this.currentStream = this.selectBestStream(streams);
    this.logger.info(`📺 Stream selecionado: ${this.currentStream.type}`);

    // 3. CRIAR PIPE
    this.currentPipePath = this.getPipePath();
    this.logger.info(`✅ Pipe criada: ${this.currentPipePath}`);
    
    // 4. Espera antes do FFmpeg
    await new Promise(res => setTimeout(res, 5000));
    
    // 5. INICIAR FFMPEG HLS
    this.status = 'streaming';
    this.logger.info(`🎬 Iniciando FFmpeg HLS...`);
    await this.startFFmpegHLS();
    
    // 6. INICIAR STREAMLINK
    this.logger.info(`📡 Iniciando Streamlink...`);
    this.startStreamlink();
  }

  async stop() {
    this.logger.info('⏹️ Parando sessão...');
    this.isRunning = false;
    this.status = 'stopping';

    try {
      // 1. PARAR MONITORAMENTO
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // 2. PARAR FFMPEG
      if (this.ffmpegProcessId) {
        this.logger.debug(`Parando FFmpeg: ${this.ffmpegProcessId}`);
        this.ffmpegHLSManager.stopProcess(this.ffmpegProcessId);
        this.ffmpegProcessId = null;
      }

      // 3. PARAR STREAMLINK
      if (this.streamlinkProcessId) {
        this.logger.debug(`Parando Streamlink: ${this.streamlinkProcessId}`);
        this.streamlinkManager.stopProcess(this.streamlinkProcessId);
        this.streamlinkProcessId = null;
      }

      // 4. REMOVER PIPE
      if (this.currentPipePath && fs.existsSync(this.currentPipePath)) {
        try {
          fs.unlinkSync(this.currentPipePath);
          this.logger.debug(`🗑️ Pipe removida: ${this.currentPipePath}`);
        } catch (error) {
          this.logger.warn(`⚠️ Erro ao remover pipe: ${error.message}`);
        }
      }

      // 5. CLEANUP TVHEADEND
      await this.tvheadend.removeChannel(this.getChannelName());

      this.status = 'stopped';
      this.emit('ended', { sessionId: this.getSessionId() });
      this.logger.info('✅ Sessão parada');

    } catch (error) {
      this.logger.error(`❌ Erro ao parar sessão: ${error.message}`);
    }
  }

  async startFFmpegHLS() {
    try {
      this.logger.info(`🎬 Iniciando FFmpeg HLS para ${this.site.id}...`);

      const options = {
        segmentDuration: 6,
        playlistSize: 5,
        deleteThreshold: 10,
        videoCodec: 'copy',
        audioCodec: 'copy',
        hlsFlags: 'delete_segments+append_list+omit_endlist'
      };

      const hlsInfo = await this.ffmpegHLSManager.startHLSConversion(
        this.currentPipePath,
        this.site.id,
        options
      );

      this.ffmpegProcessId = hlsInfo.processId;
      this.hlsInfo = hlsInfo;

      this.logger.info(`✅ FFmpeg HLS pronto!`);
      this.logger.info(`📝 Playlist: ${hlsInfo.playlistUrl}`);

    } catch (error) {
      this.logger.error(`❌ Erro ao iniciar FFmpeg HLS: ${error.message}`);
      throw error;
    }
  }

  startStreamlink() {
    // ✅ ATUALIZADO: Suporta URL direto (bypass) ou detectado
    const streamUrl = this.currentStream.bypassMode
      ? this.currentStream.url  // URL direto (bypass)
      : (this.currentStream.type === 'separate' 
          ? this.currentStream.video 
          : this.currentStream.url);

    // ✅ NOVO: Aplicar headers customizados no Streamlink
    const options = {
      quality: this.site.streamlink?.quality || 'best',
      referer: this.site.referer || this.site.url,
      userAgent: this.site.userAgent,
      retryStreams: this.site.streamlink?.retryStreams || 3,
      retryMax: this.site.streamlink?.retryMax || 5,
      customArgs: this.buildStreamlinkCustomArgs(),
      timeout: 600
    };

    this.logger.info(`📡 Iniciando Streamlink → Pipe`);
    if (this.currentStream.bypassMode) {
      this.logger.info(`⚡ Modo BYPASS - URL direto`);
    }
    
    // Iniciar de forma assíncrona
    this.streamlinkManager.streamToPipe(
      streamUrl,
      this.currentPipePath,
      options
    ).then(processId => {
      this.streamlinkProcessId = processId;
      this.logger.info(`✅ Streamlink iniciado (ID: ${processId})`);
    }).catch(error => {
      this.logger.error(`❌ Erro no Streamlink: ${error.message}`);
      if (this.isRunning) {
        setTimeout(() => this.restart(), 5000);
      }
    });
  }

  // ✅ NOVO: Construir argumentos customizados do Streamlink incluindo headers
  buildStreamlinkCustomArgs() {
    let args = this.site.streamlink?.customArgs || '';
    
    // Adicionar headers customizados como argumentos --http-header
    const customHeaders = this.site.customHeaders || {};
    
    Object.entries(customHeaders).forEach(([key, value]) => {
      // Não duplicar Referer e User-Agent (já tratados separadamente)
      if (key.toLowerCase() !== 'referer' && key.toLowerCase() !== 'user-agent') {
        args += ` --http-header "${key}=${value}"`;
      }
    });
    
    return args.trim();
  }

  async setupTVHeadendChannel() {
    const channelName = this.getChannelName();
    
    if (!this.hlsInfo || !this.hlsInfo.playlistUrl) {
      throw new Error('HLS Info não disponível - FFmpeg pode não ter iniciado corretamente');
    }
    
    const hlsUrl = `http://stream-capture:8080${this.hlsInfo.playlistUrl}`;
    
    await this.tvheadend.createHttpChannel(channelName, hlsUrl);
    
    this.logger.info(`📺 Canal TVHeadend criado: ${channelName}`);
    this.logger.info(`🔗 URL HLS: ${hlsUrl}`);
  }

  async performHealthCheck() {
    if (!this.isRunning) return;

    try {
      // Verificar FFmpeg
      if (this.ffmpegProcessId) {
        const health = this.ffmpegHLSManager.checkHealth(this.ffmpegProcessId);
        
        if (!health.healthy) {
          this.logger.warn(`⚠️ FFmpeg unhealthy: ${health.reason}`);
          await this.restart();
          return;
        }
      }

      // Verificar Streamlink
      if (this.streamlinkProcessId) {
        const process = this.streamlinkManager.activeProcesses.get(this.streamlinkProcessId);
        if (!process || !process.streamlink || process.streamlink.killed) {
          this.logger.warn('⚠️ Streamlink morreu, reiniciando...');
          await this.restart();
          return;
        }
      }

      // Log periódico
      const uptime = Date.now() - this.startTime;
      if (uptime % 60000 < 10000) {
        const stats = this.ffmpegHLSManager.getProcessStats(this.ffmpegProcessId);
        if (stats) {
          this.logger.info(`📊 Health OK: Uptime=${this.formatUptime(uptime)}, Segments=${stats.segmentCount}`);
        }
      }

    } catch (error) {
      this.logger.error(`❌ Erro no health check: ${error.message}`);
    }
  }

  startHealthCheck() {
    const interval = 30; // 30 segundos
    
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, interval * 1000);
    
    this.logger.debug(`💓 Health check iniciado (intervalo: ${interval}s)`);
  }

  async restart() {
    this.restartCount++;
    this.logger.info(`🔄 Reiniciando sessão (tentativa ${this.restartCount})...`);

    try {
      await this.stop();
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.start();
      return true;
    } catch (error) {
      this.logger.error(`❌ Erro ao reiniciar sessão: ${error.message}`);
      return false;
    }
  }

  async cleanup() {
    this.logger.debug('🧹 Executando cleanup...');
    
    try {
      if (this.ffmpegProcessId) {
        this.ffmpegHLSManager.stopProcess(this.ffmpegProcessId);
      }
      
      if (this.streamlinkProcessId) {
        this.streamlinkManager.stopProcess(this.streamlinkProcessId);
      }
      
      if (this.currentPipePath && fs.existsSync(this.currentPipePath)) {
        fs.unlinkSync(this.currentPipePath);
      }
      
    } catch (error) {
      this.logger.debug(`Erro no cleanup: ${error.message}`);
    }
  }

  getStatus() {
    const status = {
      sessionId: this.getSessionId(),
      siteId: this.site.id,
      siteName: this.site.name,
      status: this.status,
      startTime: this.startTime,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      restartCount: this.restartCount,
      currentStream: this.currentStream,
      isRunning: this.isRunning,
      pipePath: this.currentPipePath,
      bypassMode: this.site.bypassCapture || false,  // ✅ NOVO
      hlsInfo: null,
      ffmpegStats: null
    };

    if (this.hlsInfo) {
      status.hlsInfo = this.hlsInfo;
    }

    if (this.ffmpegProcessId) {
      status.ffmpegStats = this.ffmpegHLSManager.getProcessStats(this.ffmpegProcessId);
    }

    return status;
  }

  selectBestStream(streams) {
    if (streams.combined.length > 0) {
      return {
        type: 'combined',
        url: streams.combined[0],
        quality: 'best'
      };
    }

    if (streams.video && streams.audio) {
      return {
        type: 'separate',
        video: streams.video,
        audio: streams.audio,
        quality: 'best'
      };
    }

    if (streams.video) {
      return {
        type: 'video-only',
        url: streams.video,
        quality: 'best'
      };
    }

    return null;
  }

  getSessionId() {
    return `${this.site.id}_${this.startTime}`;
  }

  getChannelName() {
    return `stream_${this.site.id}`;
  }

  getPipePath() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `/app/timeshift/stream_${this.site.id}_${timestamp}.pipe`;
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
