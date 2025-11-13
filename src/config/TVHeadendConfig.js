import Logger from '../utils/Logger.js';
import Security from '../utils/Security.js';

export default class TVHeadendConfig {
  constructor(configManager) {
    this.configManager = configManager;
    this.logger = new Logger('TVHeadendConfig');
  }

  // Obter configuração completa do TVHeadend
  getConfig() {
    const config = this.configManager.config.tvheadend || {};
    
    return {
      host: config.host || 'tvheadend',
      port: config.port || 9982,
      username: config.username || '',
      password: config.password ? Security.decrypt(config.password) : '',
      channels: {
        prefix: config.channels?.prefix || 'stream_',
        groupTitle: config.channels?.groupTitle || 'Live Streams',
        createBackupHttp: config.channels?.createBackupHttp !== false,
        cleanupOldChannels: config.channels?.cleanupOldChannels !== false
      },
      integration: {
        enabled: config.integration?.enabled !== false,
        autoCreateChannels: config.integration?.autoCreateChannels !== false,
        updateEPG: config.integration?.updateEPG || false,
        recordingEnabled: config.integration?.recordingEnabled || false
      }
    };
  }

  // Definir credenciais do TVHeadend
  setCredentials(username, password) {
    if (!this.configManager.config.tvheadend) {
      this.configManager.config.tvheadend = {};
    }
    
    this.configManager.config.tvheadend.username = username;
    this.configManager.config.tvheadend.password = Security.encrypt(password);
    
    this.logger.info('Credenciais TVHeadend atualizadas');
  }

  // Definir configurações de canais
  setChannelConfig(channelConfig) {
    if (!this.configManager.config.tvheadend) {
      this.configManager.config.tvheadend = {};
    }
    
    this.configManager.config.tvheadend.channels = {
      ...this.getConfig().channels,
      ...channelConfig
    };
    
    this.logger.info('Configuração de canais atualizada');
  }

  // Definir configurações de integração
  setIntegrationConfig(integrationConfig) {
    if (!this.configManager.config.tvheadend) {
      this.configManager.config.tvheadend = {};
    }
    
    this.configManager.config.tvheadend.integration = {
      ...this.getConfig().integration,
      ...integrationConfig
    };
    
    this.logger.info('Configuração de integração atualizada');
  }

  // Obter URL base do TVHeadend
  getBaseUrl() {
    const config = this.getConfig();
    return `http://${config.host}:${config.port}`;
  }

  // Obter headers de autenticação
  getAuthHeaders() {
    const config = this.getConfig();
    
    if (config.username && config.password) {
      const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      return {
        'Authorization': `Basic ${auth}`
      };
    }
    
    return {};
  }

  // Validar configuração
  validate() {
    const config = this.getConfig();
    const errors = [];

    if (!config.host) {
      errors.push('Host do TVHeadend não configurado');
    }

    if (!config.port || config.port < 1 || config.port > 65535) {
      errors.push('Porta do TVHeadend inválida');
    }

    if (config.username && !config.password) {
      errors.push('Senha do TVHeadend não configurada');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
