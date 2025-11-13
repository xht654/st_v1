import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import Logger from '../utils/Logger.js';
import Security from '../utils/Security.js';

export default class VPNManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.logger = new Logger('VPNManager');
    this.isConnected = false;
    this.connectionProcess = null;
    this.configFile = '/tmp/purevpn_config.ovpn';
  }

  // Conectar VPN
  async connect() {
    const vpnConfig = this.configManager.getVPNConfig();
    
    if (!vpnConfig.enabled) {
      this.logger.info('VPN desabilitada');
      return false;
    }

    if (this.isConnected) {
      this.logger.info('VPN já conectada');
      return true;
    }

    try {
      await this.setupVPNConfig(vpnConfig);
      await this.establishConnection(vpnConfig);
      this.isConnected = true;
      this.logger.info('VPN conectada com sucesso');
      return true;
    } catch (error) {
      this.logger.error('Erro ao conectar VPN:', error);
      throw error;
    }
  }

  // Desconectar VPN
  async disconnect() {
    if (!this.isConnected) return;

    try {
      if (this.connectionProcess) {
        this.connectionProcess.kill('SIGTERM');
        this.connectionProcess = null;
      }

      // Comando específico para parar VPN
      await this.execCommand('killall openvpn');
      
      this.isConnected = false;
      this.logger.info('VPN desconectada');
    } catch (error) {
      this.logger.warn('Erro ao desconectar VPN:', error);
    }
  }

  // Verificar status da conexão
  async checkConnection() {
    if (!this.isConnected) return false;

    try {
      // Verificar IP externo para confirmar VPN
      const result = await this.execCommand('curl -s --max-time 10 https://api.ipify.org');
      const currentIP = result.stdout.trim();
      
      // Log do IP atual (para debug)
      this.logger.debug(`IP atual: ${currentIP}`);
      
      return this.isConnected;
    } catch (error) {
      this.logger.warn('Erro ao verificar conexão VPN:', error);
      this.isConnected = false;
      return false;
    }
  }

  // Configurar arquivo de configuração VPN
  async setupVPNConfig(vpnConfig) {
    let configContent;

    switch (vpnConfig.provider) {
      case 'purevpn':
        configContent = this.generatePureVPNConfig(vpnConfig);
        break;
      case 'openvpn':
        configContent = vpnConfig.customConfig || '';
        break;
      default:
        throw new Error(`Provedor VPN não suportado: ${vpnConfig.provider}`);
    }

    fs.writeFileSync(this.configFile, configContent);

    // Criar arquivo de credenciais se necessário
    if (vpnConfig.username && vpnConfig.password) {
      const authFile = '/tmp/vpn_auth.txt';
      const credentials = `${vpnConfig.username}\n${Security.decrypt(vpnConfig.password)}`;
      fs.writeFileSync(authFile, credentials);
      fs.chmodSync(authFile, '600');
    }
  }

  // Gerar configuração PureVPN
  generatePureVPNConfig(vpnConfig) {
    const server = vpnConfig.server || 'us1-ovpn.purevpn.net';
    const port = vpnConfig.port || 1194;
    
    return `
client
dev tun
proto udp
remote ${server} ${port}
resolv-retry infinite
nobind
persist-key
persist-tun
ca /tmp/purevpn_ca.crt
auth-user-pass /tmp/vpn_auth.txt
comp-lzo
verb 3
auth SHA1
cipher AES-128-CBC
fast-io
route-delay 2
redirect-gateway def1
`;
  }

  // Estabelecer conexão VPN
  async establishConnection(vpnConfig) {
    return new Promise((resolve, reject) => {
      const args = ['--config', this.configFile, '--daemon'];
      
      this.connectionProcess = spawn('openvpn', args);
      
      let connected = false;
      const timeout = setTimeout(() => {
        if (!connected) {
          reject(new Error('Timeout na conexão VPN'));
        }
      }, 30000);

      this.connectionProcess.stderr.on('data', (data) => {
        const output = data.toString();
        this.logger.debug('VPN stderr:', output);
        
        if (output.includes('Initialization Sequence Completed')) {
          connected = true;
          clearTimeout(timeout);
          resolve();
        }
        
        if (output.includes('AUTH_FAILED') || output.includes('TLS Error')) {
          clearTimeout(timeout);
          reject(new Error('Falha de autenticação VPN'));
        }
      });

      this.connectionProcess.on('exit', (code) => {
        if (!connected) {
          clearTimeout(timeout);
          reject(new Error(`Processo VPN terminou com código ${code}`));
        }
      });
    });
  }

  // Executar comando shell
  execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  // Obter status da VPN
  getStatus() {
    return {
      enabled: this.configManager.getVPNConfig().enabled,
      connected: this.isConnected,
      provider: this.configManager.getVPNConfig().provider
    };
  }
}
