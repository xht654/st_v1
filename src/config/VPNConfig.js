import Logger from '../utils/Logger.js';
import Security from '../utils/Security.js';

export default class VPNConfig {
  constructor(configManager) {
    this.configManager = configManager;
    this.logger = new Logger('VPNConfig');
  }

  // Obter configuração completa da VPN
  getConfig() {
    const config = this.configManager.config.vpn || {};
    
    return {
      enabled: config.enabled || false,
      provider: config.provider || 'purevpn',
      autoConnect: config.autoConnect !== false,
      reconnectOnFailure: config.reconnectOnFailure !== false,
      config: this.getProviderConfig(config.provider, config.config || {}),
      healthCheck: {
        enabled: config.healthCheck?.enabled !== false,
        interval: config.healthCheck?.interval || 120,
        testUrl: config.healthCheck?.testUrl || 'https://api.ipify.org',
        expectedResponse: config.healthCheck?.expectedResponse || 'ip'
      }
    };
  }

  // Obter configuração específica do provedor
  getProviderConfig(provider, config) {
    switch (provider) {
      case 'purevpn':
        return {
          server: config.purevpn?.server || 'us1-ovpn.purevpn.net',
          port: config.purevpn?.port || 1194,
          protocol: config.purevpn?.protocol || 'udp',
          username: config.purevpn?.username || '',
          password: config.purevpn?.password ? Security.decrypt(config.purevpn.password) : '',
          configFile: config.purevpn?.configFile || '/tmp/purevpn.ovpn'
        };
      
      case 'openvpn':
        return {
          configFile: config.openvpn?.configFile || '/app/vpn/custom.ovpn',
          authFile: config.openvpn?.authFile || '/app/vpn/auth.txt',
          customConfig: config.openvpn?.customConfig || ''
        };
      
      default:
        throw new Error(`Provedor VPN não suportado: ${provider}`);
    }
  }

  // Definir configuração da VPN
  setConfig(vpnConfig) {
    if (!this.configManager.config.vpn) {
      this.configManager.config.vpn = {};
    }

    // Criptografar senhas se fornecidas
    if (vpnConfig.config?.purevpn?.password) {
      vpnConfig.config.purevpn.password = Security.encrypt(vpnConfig.config.purevpn.password);
    }

    this.configManager.config.vpn = {
      ...this.configManager.config.vpn,
      ...vpnConfig
    };

    this.logger.info(`Configuração VPN atualizada (provedor: ${vpnConfig.provider || 'não especificado'})`);
  }

  // Definir credenciais PureVPN
  setPureVPNCredentials(username, password, server = null) {
    if (!this.configManager.config.vpn) {
      this.configManager.config.vpn = { provider: 'purevpn' };
    }

    if (!this.configManager.config.vpn.config) {
      this.configManager.config.vpn.config = {};
    }

    if (!this.configManager.config.vpn.config.purevpn) {
      this.configManager.config.vpn.config.purevpn = {};
    }

    this.configManager.config.vpn.config.purevpn.username = username;
    this.configManager.config.vpn.config.purevpn.password = Security.encrypt(password);
    
    if (server) {
      this.configManager.config.vpn.config.purevpn.server = server;
    }

    this.logger.info('Credenciais PureVPN atualizadas');
  }

  // Habilitar/desabilitar VPN
  setEnabled(enabled) {
    if (!this.configManager.config.vpn) {
      this.configManager.config.vpn = {};
    }

    this.configManager.config.vpn.enabled = enabled;
    this.logger.info(`VPN ${enabled ? 'habilitada' : 'desabilitada'}`);
  }

  // Obter lista de servidores PureVPN disponíveis
  getPureVPNServers() {
    return [
      { name: 'Estados Unidos 1', server: 'us1-ovpn.purevpn.net', location: 'US' },
      { name: 'Estados Unidos 2', server: 'us2-ovpn.purevpn.net', location: 'US' },
      { name: 'Reino Unido', server: 'uk1-ovpn.purevpn.net', location: 'UK' },
      { name: 'Alemanha', server: 'de1-ovpn.purevpn.net', location: 'DE' },
      { name: 'França', server: 'fr1-ovpn.purevpn.net', location: 'FR' },
      { name: 'Japão', server: 'jp1-ovpn.purevpn.net', location: 'JP' },
      { name: 'Austrália', server: 'au1-ovpn.purevpn.net', location: 'AU' },
      { name: 'Canadá', server: 'ca1-ovpn.purevpn.net', location: 'CA' },
      { name: 'Países Baixos', server: 'nl1-ovpn.purevpn.net', location: 'NL' },
      { name: 'Suécia', server: 'se1-ovpn.purevpn.net', location: 'SE' }
    ];
  }

  // Validar configuração
  validate() {
    const config = this.getConfig();
    const errors = [];

    if (config.enabled) {
      switch (config.provider) {
        case 'purevpn':
          const pureConfig = config.config;
          if (!pureConfig.username) {
            errors.push('Username PureVPN não configurado');
          }
          if (!pureConfig.password) {
            errors.push('Password PureVPN não configurado');
          }
          if (!pureConfig.server) {
            errors.push('Servidor PureVPN não configurado');
          }
          break;

        case 'openvpn':
          const ovpnConfig = config.config;
          if (!ovpnConfig.configFile) {
            errors.push('Arquivo de configuração OpenVPN não especificado');
          }
          break;

        default:
          errors.push(`Provedor VPN não suportado: ${config.provider}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Gerar configuração OpenVPN para PureVPN
  generatePureVPNConfig() {
    const config = this.getConfig();
    const pureConfig = config.config;

    if (config.provider !== 'purevpn') {
      throw new Error('Não é possível gerar configuração PureVPN para outro provedor');
    }

    return `# PureVPN Configuration
client
dev tun
proto ${pureConfig.protocol}
remote ${pureConfig.server} ${pureConfig.port}
resolv-retry infinite
nobind
persist-key
persist-tun
auth-user-pass ${pureConfig.configFile.replace('.ovpn', '_auth.txt')}
comp-lzo
verb 3
auth SHA256
cipher AES-256-CBC
fast-io
route-delay 2
redirect-gateway def1

# Certificado CA (seria obtido do PureVPN)
<ca>
-----BEGIN CERTIFICATE-----
# CA Certificate here
-----END CERTIFICATE-----
</ca>
`;
  }
}
