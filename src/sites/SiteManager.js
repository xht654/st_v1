import EventEmitter from 'events';
import CaptureSession from './CaptureSession.js';
import Logger from '../utils/Logger.js';

export default class SiteManager extends EventEmitter {
  constructor(configManager) {
    super();
    this.configManager = configManager;
    this.logger = new Logger('SiteManager');
    this.sites = new Map();
    this.loadSites();
  }

  // Carregar sites da configuração
  loadSites() {
    const sitesConfig = this.configManager.config.sites || {};
    
    this.sites.clear();
    
    Object.entries(sitesConfig).forEach(([id, config]) => {
      this.sites.set(id, {
        id,
        ...config,
        status: 'idle',
        lastUsed: null,
        successCount: 0,
        failureCount: 0
      });
    });

    this.logger.info(`${this.sites.size} sites carregados`);
  }

  // Recarregar sites
  reloadSites() {
    this.logger.info('Recarregando sites...');
    this.loadSites();
    this.emit('sitesReloaded');
  }

  // Obter site por ID
  getSite(siteId) {
    return this.sites.get(siteId);
  }

  // Obter todos os sites
  getAllSites() {
    return Array.from(this.sites.values());
  }

  // Obter sites habilitados
  getEnabledSites() {
    return this.getAllSites().filter(site => site.enabled);
  }

  // Obter sites por prioridade
  getSitesByPriority() {
    return this.getEnabledSites()
      .sort((a, b) => (a.priority || 5) - (b.priority || 5));
  }

  // Obter sites por método de captura
  getSitesByMethod(method) {
    return this.getEnabledSites()
      .filter(site => (site.captureMethod || 'advanced') === method);
  }

  // Atualizar status de um site
  updateSiteStatus(siteId, status, metadata = {}) {
    const site = this.sites.get(siteId);
    if (!site) {
      this.logger.warn(`Site não encontrado: ${siteId}`);
      return;
    }

    site.status = status;
    site.lastStatusUpdate = Date.now();
    
    if (metadata.success) {
      site.successCount++;
      site.lastUsed = Date.now();
    } else if (metadata.failure) {
      site.failureCount++;
    }

    this.sites.set(siteId, site);
    this.emit('siteStatusUpdated', { siteId, status, metadata });
  }

  // Adicionar novo site
  addSite(siteId, siteConfig) {
    if (this.sites.has(siteId)) {
      throw new Error(`Site já existe: ${siteId}`);
    }

    const site = {
      id: siteId,
      ...siteConfig,
      status: 'idle',
      lastUsed: null,
      successCount: 0,
      failureCount: 0,
      createdAt: Date.now()
    };

    this.sites.set(siteId, site);
    
    // Atualizar configuração
    if (!this.configManager.config.sites) {
      this.configManager.config.sites = {};
    }
    this.configManager.config.sites[siteId] = siteConfig;

    this.logger.info(`Site adicionado: ${siteId}`);
    this.emit('siteAdded', { siteId, site });
    
    return site;
  }

  // Atualizar site existente
  updateSite(siteId, siteConfig) {
    if (!this.sites.has(siteId)) {
      throw new Error(`Site não encontrado: ${siteId}`);
    }

    const currentSite = this.sites.get(siteId);
    const updatedSite = {
      ...currentSite,
      ...siteConfig,
      updatedAt: Date.now()
    };

    this.sites.set(siteId, updatedSite);
    
    // Atualizar configuração
    this.configManager.config.sites[siteId] = siteConfig;

    this.logger.info(`Site atualizado: ${siteId}`);
    this.emit('siteUpdated', { siteId, site: updatedSite });
    
    return updatedSite;
  }

  // Remover site
  removeSite(siteId) {
    if (!this.sites.has(siteId)) {
      throw new Error(`Site não encontrado: ${siteId}`);
    }

    this.sites.delete(siteId);
    
    // Remover da configuração
    if (this.configManager.config.sites) {
      delete this.configManager.config.sites[siteId];
    }

    this.logger.info(`Site removido: ${siteId}`);
    this.emit('siteRemoved', { siteId });
  }

  // Habilitar/desabilitar site
  toggleSite(siteId, enabled = null) {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error(`Site não encontrado: ${siteId}`);
    }

    const newStatus = enabled !== null ? enabled : !site.enabled;
    site.enabled = newStatus;
    site.updatedAt = Date.now();

    this.sites.set(siteId, site);
    
    // Atualizar configuração
    if (this.configManager.config.sites[siteId]) {
      this.configManager.config.sites[siteId].enabled = newStatus;
    }

    this.logger.info(`Site ${siteId} ${newStatus ? 'habilitado' : 'desabilitado'}`);
    this.emit('siteToggled', { siteId, enabled: newStatus });
    
    return site;
  }

  // Validar configuração de um site
  validateSite(siteConfig) {
    const errors = [];

    // Validações obrigatórias
    if (!siteConfig.name) {
      errors.push('Nome é obrigatório');
    }

    if (!siteConfig.url) {
      errors.push('URL é obrigatória');
    } else {
      try {
        new URL(siteConfig.url);
      } catch {
        errors.push('URL inválida');
      }
    }

    // Validações opcionais
    if (siteConfig.captureMethod && !['simple', 'advanced'].includes(siteConfig.captureMethod)) {
      errors.push('Método de captura deve ser "simple" ou "advanced"');
    }

    if (siteConfig.priority && (siteConfig.priority < 1 || siteConfig.priority > 10)) {
      errors.push('Prioridade deve estar entre 1 e 10');
    }

    if (siteConfig.waitTime && (siteConfig.waitTime < 1000 || siteConfig.waitTime > 60000)) {
      errors.push('Tempo de espera deve estar entre 1000ms e 60000ms');
    }

    // Validar configurações específicas
    if (siteConfig.captureMethod === 'simple' && siteConfig.simpleCapture) {
      if (!siteConfig.simpleCapture.patterns || !Array.isArray(siteConfig.simpleCapture.patterns)) {
        errors.push('Padrões de captura simples são obrigatórios');
      }
    }

    if (siteConfig.streamlink) {
      if (siteConfig.streamlink.retryStreams && siteConfig.streamlink.retryStreams > 10) {
        errors.push('Retry streams não pode ser maior que 10');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Obter estatísticas de sites
  getStats() {
    const sites = this.getAllSites();
    
    return {
      total: sites.length,
      enabled: sites.filter(s => s.enabled).length,
      disabled: sites.filter(s => !s.enabled).length,
      byMethod: {
        simple: sites.filter(s => (s.captureMethod || 'advanced') === 'simple').length,
        advanced: sites.filter(s => (s.captureMethod || 'advanced') === 'advanced').length
      },
      byStatus: sites.reduce((acc, site) => {
        acc[site.status] = (acc[site.status] || 0) + 1;
        return acc;
      }, {}),
      totalSuccesses: sites.reduce((sum, site) => sum + (site.successCount || 0), 0),
      totalFailures: sites.reduce((sum, site) => sum + (site.failureCount || 0), 0)
    };
  }

  // Obter sites recomendados baseado em histórico
  getRecommendedSites(limit = 3) {
    return this.getEnabledSites()
      .filter(site => site.successCount > 0)
      .sort((a, b) => {
        // Calcular score baseado em sucesso/falha e prioridade
        const scoreA = (a.successCount / Math.max(a.failureCount || 1, 1)) * (11 - (a.priority || 5));
        const scoreB = (b.successCount / Math.max(b.failureCount || 1, 1)) * (11 - (b.priority || 5));
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  // Obter próximo site para captura (rotação inteligente)
  getNextSiteForCapture(excludeSites = []) {
    const availableSites = this.getSitesByPriority()
      .filter(site => !excludeSites.includes(site.id))
      .filter(site => site.status !== 'active');

    if (availableSites.length === 0) {
      return null;
    }

    // Priorizar sites que não foram usados recentemente
    const notRecentlyUsed = availableSites.filter(site => {
      if (!site.lastUsed) return true;
      const timeSinceLastUse = Date.now() - site.lastUsed;
      return timeSinceLastUse > 300000; // 5 minutos
    });

    return notRecentlyUsed.length > 0 ? notRecentlyUsed[0] : availableSites[0];
  }

  // Importar sites de um arquivo
  importSites(sitesData) {
    const imported = [];
    const errors = [];

    Object.entries(sitesData).forEach(([siteId, siteConfig]) => {
      try {
        const validation = this.validateSite(siteConfig);
        if (!validation.isValid) {
          errors.push({ siteId, errors: validation.errors });
          return;
        }

        if (this.sites.has(siteId)) {
          this.updateSite(siteId, siteConfig);
        } else {
          this.addSite(siteId, siteConfig);
        }
        
        imported.push(siteId);
      } catch (error) {
        errors.push({ siteId, errors: [error.message] });
      }
    });

    this.logger.info(`Importação concluída: ${imported.length} sites importados, ${errors.length} erros`);
    
    return {
      imported,
      errors,
      summary: {
        total: Object.keys(sitesData).length,
        successful: imported.length,
        failed: errors.length
      }
    };
  }

  // Exportar sites
  exportSites(siteIds = null) {
    const sitesToExport = siteIds 
      ? siteIds.map(id => this.getSite(id)).filter(Boolean)
      : this.getAllSites();

    const exported = {};
    
    sitesToExport.forEach(site => {
      const { id, status, lastUsed, successCount, failureCount, createdAt, updatedAt, ...exportData } = site;
      exported[id] = exportData;
    });

    return exported;
  }
}
