import EventEmitter from 'events';
import SessionManager from './SessionManager.js';
import StreamDetector from './StreamDetector.js';
import Logger from '../utils/Logger.js';

export default class StreamCapture extends EventEmitter {
  constructor(configManager, vpnManager) {
    super();
    this.configManager = configManager;
    this.vpnManager = vpnManager;
    this.logger = new Logger('StreamCapture');
    
    this.sessionManager = new SessionManager(configManager);
    this.isRunning = false;
    this.mainLoop = null;
    this.stats = {
      totalCaptures: 0,
      successfulCaptures: 0,
      failedCaptures: 0,
      startTime: null,
      lastCaptureTime: null
    };
  }

  // Inicializar sistema de captura
  async initialize() {
    try {
      this.logger.info('Inicializando sistema de captura...');

      // Conectar VPN se habilitada
      const vpnConfig = this.configManager.getVPNConfig();
      if (vpnConfig.enabled && vpnConfig.autoConnect) {
        await this.vpnManager.connect();
      }

      // Configurar event listeners
      this.setupEventListeners();

      // Inicializar session manager
      await this.sessionManager.initialize();

      this.stats.startTime = Date.now();
      this.logger.info('Sistema de captura inicializado com sucesso');

      this.emit('initialized');
      return true;

    } catch (error) {
      this.logger.error('Erro na inicialização:', error);
      this.emit('error', error);
      throw error;
    }
  }

  // Configurar event listeners
  setupEventListeners() {
    // Session Manager events
    this.sessionManager.on('streamFound', (data) => {
      this.stats.successfulCaptures++;
      this.stats.lastCaptureTime = Date.now();
      this.emit('streamFound', data);
    });

    this.sessionManager.on('sessionError', (data) => {
      this.stats.failedCaptures++;
      this.emit('sessionError', data);
    });

    this.sessionManager.on('sessionStarted', (data) => {
      this.emit('sessionStarted', data);
    });

    this.sessionManager.on('sessionEnded', (data) => {
      this.emit('sessionEnded', data);
    });

    // VPN events (se disponível)
    if (this.vpnManager) {
      this.vpnManager.on('connected', () => {
        this.logger.info('VPN conectada - captura pode prosseguir');
        this.emit('vpnConnected');
      });

      this.vpnManager.on('disconnected', () => {
        this.logger.warn('VPN desconectada');
        this.emit('vpnDisconnected');
      });
    }
  }

  // Iniciar captura automática
  async startAutomaticCapture() {
    if (this.isRunning) {
      this.logger.warn('Captura automática já está em execução');
      return;
    }

    this.logger.info('Iniciando captura automática...');
    this.isRunning = true;

    try {
      // Iniciar sessões paralelas baseadas na configuração
      await this.sessionManager.startParallelCapture();
      
      // Iniciar loop principal de monitoramento
      this.startMainLoop();

      this.emit('captureStarted');
      this.logger.info('Captura automática iniciada');

    } catch (error) {
      this.isRunning = false;
      this.logger.error('Erro ao iniciar captura automática:', error);
      this.emit('error', error);
      throw error;
    }
  }

  // Parar captura automática
  async stopAutomaticCapture() {
    if (!this.isRunning) {
      this.logger.warn('Captura automática não está em execução');
      return;
    }

    this.logger.info('Parando captura automática...');
    this.isRunning = false;

    try {
      // Parar loop principal
      if (this.mainLoop) {
        clearInterval(this.mainLoop);
        this.mainLoop = null;
      }

      // Parar todas as sessões
      await this.sessionManager.stopAllSessions();

      this.emit('captureStopped');
      this.logger.info('Captura automática parada');

    } catch (error) {
      this.logger.error('Erro ao parar captura automática:', error);
      this.emit('error', error);
    }
  }

  // Loop principal de monitoramento
  startMainLoop() {
    const config = this.configManager.config.streaming || {};
    const interval = config.cycleInterval || 600; // 10 minutos padrão

    this.mainLoop = setInterval(async () => {
      try {
        await this.performMaintenanceTasks();
      } catch (error) {
        this.logger.error('Erro no loop principal:', error);
      }
    }, interval * 1000);

    this.logger.info(`Loop principal iniciado (intervalo: ${interval}s)`);
  }

  // Tarefas de manutenção periódica
  async performMaintenanceTasks() {
    this.logger.debug('Executando tarefas de manutenção...');

    try {
      // Verificar saúde das sessões
      await this.checkSessionsHealth();

      // Verificar conectividade VPN
      await this.checkVPNHealth();

      // Rotacionar sessões se configurado
      await this.performSessionRotation();

      // Limpeza de recursos
      await this.performCleanup();

    } catch (error) {
      this.logger.error('Erro nas tarefas de manutenção:', error);
    }
  }

  // Verificar saúde das sessões
  async checkSessionsHealth() {
    const sessions = this.sessionManager.getSessionsStatus();
    const activeSessions = Object.values(sessions).filter(s => s.isRunning);

    this.logger.debug(`Verificando ${activeSessions.length} sessões ativas`);

    for (const session of activeSessions) {
      // Verificar uptime excessivo
      const maxUptime = this.configManager.config.streaming?.autoRestart?.tokenExpiryCheck || 1800;
      if (session.uptime > maxUptime * 1000) {
        this.logger.info(`Sessão ${session.siteId} com uptime alto, reiniciando...`);
        await this.sessionManager.restartSession(session.siteId);
      }
    }
  }

  // Verificar saúde da VPN
  async checkVPNHealth() {
    if (!this.vpnManager) return;

    const vpnConfig = this.configManager.getVPNConfig();
    if (!vpnConfig.enabled || !vpnConfig.healthCheck?.enabled) return;

    try {
      const isConnected = await this.vpnManager.checkConnection();
      if (!isConnected && vpnConfig.reconnectOnFailure) {
        this.logger.warn('VPN desconectada, tentando reconectar...');
        await this.vpnManager.connect();
      }
    } catch (error) {
      this.logger.error('Erro na verificação de saúde da VPN:', error);
    }
  }

  // Rotação de sessões
  async performSessionRotation() {
    const config = this.configManager.config.sessions?.rotation;
    if (!config?.enabled) return;

    const now = Date.now();
    const interval = config.intervalMinutes * 60 * 1000;

    if (!this.lastRotation || (now - this.lastRotation) >= interval) {
      this.logger.info('Executando rotação de sessões...');
      
      try {
        // Parar sessões atuais
        await this.sessionManager.stopAllSessions();
        
        // Aguardar um momento
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Iniciar novas sessões
        await this.sessionManager.startParallelCapture(config.sites);
        
        this.lastRotation = now;
        this.logger.info('Rotação de sessões concluída');
        
      } catch (error) {
        this.logger.error('Erro na rotação de sessões:', error);
      }
    }
  }

  // Limpeza de recursos
  async performCleanup() {
    try {
      // Limpeza seria implementada conforme necessário
      // Por exemplo: limpeza de arquivos temporários, logs antigos, etc.
      this.logger.debug('Limpeza de recursos executada');
    } catch (error) {
      this.logger.error('Erro na limpeza:', error);
    }
  }

  // Captura manual de um site específico
  async captureSpecificSite(siteId) {
    this.logger.info(`Iniciando captura manual: ${siteId}`);
    this.stats.totalCaptures++;

    try {
      const result = await this.sessionManager.startSiteCapture({ 
        id: siteId, 
        ...this.configManager.config.sites[siteId] 
      });

      this.stats.successfulCaptures++;
      this.stats.lastCaptureTime = Date.now();
      
      this.emit('manualCaptureSuccess', { siteId, result });
      return result;

    } catch (error) {
      this.stats.failedCaptures++;
      this.logger.error(`Erro na captura manual de ${siteId}:`, error);
      this.emit('manualCaptureError', { siteId, error });
      throw error;
    }
  }

  // Obter estatísticas
  getStats() {
    return {
      ...this.stats,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      isRunning: this.isRunning,
      activeSessions: Object.keys(this.sessionManager.getSessionsStatus()).length,
      vpnStatus: this.vpnManager ? this.vpnManager.getStatus() : null
    };
  }

  // Shutdown graceful
  async shutdown() {
    this.logger.info('Iniciando shutdown do sistema de captura...');

    try {
      // Parar captura
      await this.stopAutomaticCapture();

      // Desconectar VPN
      if (this.vpnManager) {
        await this.vpnManager.disconnect();
      }

      // Remover listeners
      this.removeAllListeners();

      this.logger.info('Shutdown concluído');
      this.emit('shutdown');

    } catch (error) {
      this.logger.error('Erro no shutdown:', error);
    }
  }
}
