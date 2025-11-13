import EventEmitter from 'events';
import CaptureSession from '../sites/CaptureSession.js';
import Logger from '../utils/Logger.js';

export default class SessionManager extends EventEmitter {
  constructor(configManager) {
    super();
    this.configManager = configManager;
    this.activeSessions = new Map();
    this.maxParallel = 3;
    this.logger = new Logger('SessionManager');
  }

  // Iniciar captura de múltiplos sites
  async startParallelCapture(siteIds = []) {
    const config = this.configManager.config;
    const sites = siteIds.length > 0 
      ? siteIds.map(id => ({ id, ...config.sites[id] }))
      : Object.entries(config.sites)
          .filter(([id, site]) => site.enabled)
          .map(([id, site]) => ({ id, ...site }));

    if (sites.length === 0) {
      throw new Error('Nenhum site habilitado para captura');
    }

    const promises = sites.slice(0, this.maxParallel).map(site => 
      this.startSiteCapture(site)
    );

    const results = await Promise.allSettled(promises);
    return this.processResults(results, sites);
  }

  // Iniciar captura de um site específico
  async startSiteCapture(site) {
    if (this.activeSessions.has(site.id)) {
      this.logger.warn(`Sessão já ativa para ${site.id}`);
      return this.activeSessions.get(site.id);
    }

    const session = new CaptureSession(site, this.configManager);
    this.activeSessions.set(site.id, session);

    // Event listeners
    session.on('streamFound', (streamData) => {
      this.emit('streamFound', { siteId: site.id, streamData });
    });

    session.on('error', (error) => {
      this.logger.error(`Erro na sessão ${site.id}:`, error);
      this.activeSessions.delete(site.id);
    });

    session.on('ended', () => {
      this.activeSessions.delete(site.id);
    });

    try {
      await session.start();
      return session;
    } catch (error) {
      this.activeSessions.delete(site.id);
      throw error;
    }
  }

  // Parar uma sessão específica
  async stopSession(siteId) {
    const session = this.activeSessions.get(siteId);
    if (session) {
      await session.stop();
      this.activeSessions.delete(siteId);
      this.logger.info(`Sessão ${siteId} parada`);
    }
  }

  // Parar todas as sessões
  async stopAllSessions() {
    const promises = Array.from(this.activeSessions.keys()).map(siteId => 
      this.stopSession(siteId)
    );
    await Promise.all(promises);
  }

  // Obter status de todas as sessões
  getSessionsStatus() {
    const status = {};
    for (const [siteId, session] of this.activeSessions) {
      status[siteId] = session.getStatus();
    }
    return status;
  }

  processResults(results, sites) {
    const successful = [];
    const failed = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push({ site: sites[index], session: result.value });
      } else {
        failed.push({ site: sites[index], error: result.reason });
      }
    });

    return { successful, failed };
  }
}
