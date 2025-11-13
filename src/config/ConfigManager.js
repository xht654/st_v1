import fs from 'fs';
import path from 'path';
import Security from '../utils/Security.js';

export default class ConfigManager {
  constructor() {
    this.configPath = '/app/config.json';
    this.config = {};
    this.watchers = [];
  }

  // Carregar configuração com validação
  async loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(data);
      await this.validateAndMigrate();
      return this.config;
    } catch (error) {
      throw new Error(`Erro ao carregar configuração: ${error.message}`);
    }
  }

  // Salvar configuração com backup
  async saveConfig() {
    try {
      const backup = `${this.configPath}.backup.${Date.now()}`;
      fs.copyFileSync(this.configPath, backup);
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      
      // Manter apenas os 5 backups mais recentes
      this.cleanupBackups();
    } catch (error) {
      throw new Error(`Erro ao salvar configuração: ${error.message}`);
    }
  }

  // Obter credenciais TVHeadend de forma segura
  getTVHeadendCredentials() {
    const tvhConfig = this.config.tvheadend || {};
    return {
      host: tvhConfig.host || 'tvheadend',
      port: tvhConfig.port || 9982,
      username: tvhConfig.username || '',
      password: tvhConfig.password ? Security.decrypt(tvhConfig.password) : ''
    };
  }

  // Definir credenciais TVHeadend de forma segura
  setTVHeadendCredentials(username, password) {
    if (!this.config.tvheadend) this.config.tvheadend = {};
    this.config.tvheadend.username = username;
    this.config.tvheadend.password = Security.encrypt(password);
  }

  // Obter configuração VPN
  getVPNConfig() {
    return this.config.vpn || { enabled: false };
  }

  // Definir configuração VPN
  setVPNConfig(vpnConfig) {
    this.config.vpn = {
      ...vpnConfig,
      password: vpnConfig.password ? Security.encrypt(vpnConfig.password) : undefined
    };
  }

  validateAndMigrate() {
    // Validar e migrar configuração para nova estrutura
    if (!this.config.sessions) {
      this.config.sessions = { maxParallel: 3, active: {} };
    }
    if (!this.config.vpn) {
      this.config.vpn = { enabled: false, provider: 'purevpn' };
    }
  }

  cleanupBackups() {
    const dir = path.dirname(this.configPath);
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('config.json.backup.'))
      .sort()
      .reverse();
    
    if (files.length > 5) {
      files.slice(5).forEach(f => fs.unlinkSync(path.join(dir, f)));
    }
  }
}
