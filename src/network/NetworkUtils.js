import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';
import net from 'net';
import Logger from '../utils/Logger.js';

const execAsync = promisify(exec);
const lookupAsync = promisify(dns.lookup);

export default class NetworkUtils {
  constructor() {
    this.logger = new Logger('NetworkUtils');
  }

  // Obter IP externo
  async getExternalIP() {
    const services = [
      'https://api.ipify.org',
      'https://icanhazip.com',
      'https://ipecho.net/plain',
      'https://myexternalip.com/raw'
    ];

    for (const service of services) {
      try {
        const { stdout } = await execAsync(`curl -s --max-time 10 "${service}"`);
        const ip = stdout.trim();
        
        if (this.isValidIP(ip)) {
          return ip;
        }
      } catch (error) {
        this.logger.debug(`Falha ao obter IP de ${service}:`, error.message);
      }
    }

    throw new Error('Não foi possível obter IP externo');
  }

  // Verificar se é um IP válido
  isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  // Verificar conectividade com host
  async checkConnectivity(host, port, timeout = 5000) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      const onConnect = () => {
        socket.destroy();
        resolve(true);
      };

      const onError = () => {
        socket.destroy();
        resolve(false);
      };

      socket.setTimeout(timeout);
      socket.on('connect', onConnect);
      socket.on('error', onError);
      socket.on('timeout', onError);

      socket.connect(port, host);
    });
  }

  // Resolver DNS
  async resolveDNS(hostname) {
    try {
      const result = await lookupAsync(hostname);
      return result.address;
    } catch (error) {
      this.logger.error(`Erro ao resolver DNS para ${hostname}:`, error);
      throw error;
    }
  }

  // Verificar se porta está em uso
  async isPortInUse(port, host = 'localhost') {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, host, () => {
        server.once('close', () => resolve(false));
        server.close();
      });
      
      server.on('error', () => resolve(true));
    });
  }

  // Encontrar porta livre
  async findFreePort(startPort = 3000, maxPort = 65535) {
    for (let port = startPort; port <= maxPort; port++) {
      const inUse = await this.isPortInUse(port);
      if (!inUse) {
        return port;
      }
    }
    
    throw new Error(`Nenhuma porta livre encontrada entre ${startPort} e ${maxPort}`);
  }

  // Ping para verificar conectividade
  async ping(host, count = 1) {
    try {
      const { stdout } = await execAsync(`ping -c ${count} ${host}`);
      return {
        success: true,
        output: stdout
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Traceroute
  async traceroute(host) {
    try {
      const { stdout } = await execAsync(`traceroute ${host}`);
      return {
        success: true,
        output: stdout
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verificar velocidade de conexão
  async checkSpeed(testUrl = 'http://speedtest.ftp.otenet.gr/files/test100k.db') {
    const startTime = Date.now();
    
    try {
      await execAsync(`curl -s --max-time 30 "${testUrl}" > /dev/null`);
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      return {
        success: true,
        duration,
        speed: duration > 0 ? (100 / duration).toFixed(2) : 0 // KB/s aproximado
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Obter informações de rede
  async getNetworkInfo() {
    try {
      const [externalIP, localInfo] = await Promise.all([
        this.getExternalIP().catch(() => 'N/A'),
        this.getLocalNetworkInfo()
      ]);

      return {
        externalIP,
        ...localInfo
      };
    } catch (error) {
      this.logger.error('Erro ao obter informações de rede:', error);
      throw error;
    }
  }

  // Obter informações de rede local
  async getLocalNetworkInfo() {
    try {
      const interfaces = await execAsync('ip addr show');
      const routes = await execAsync('ip route show');
      
      return {
        interfaces: this.parseNetworkInterfaces(interfaces.stdout),
        routes: this.parseRoutes(routes.stdout)
      };
    } catch (error) {
      this.logger.error('Erro ao obter informações locais:', error);
      return {
        interfaces: [],
        routes: []
      };
    }
  }

  // Parse interfaces de rede
  parseNetworkInterfaces(output) {
    const interfaces = [];
    const lines = output.split('\n');
    
    let currentInterface = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Nova interface
      if (trimmed.match(/^\d+:/)) {
        if (currentInterface) {
          interfaces.push(currentInterface);
        }
        
        const match = trimmed.match(/^\d+:\s+([^:]+):/);
        if (match) {
          currentInterface = {
            name: match[1],
            addresses: []
          };
        }
      }
      
      // Endereço IP
      if (trimmed.startsWith('inet ') && currentInterface) {
        const match = trimmed.match(/inet\s+([^\s]+)/);
        if (match) {
          currentInterface.addresses.push(match[1]);
        }
      }
    }
    
    if (currentInterface) {
      interfaces.push(currentInterface);
    }
    
    return interfaces;
  }

  // Parse rotas
  parseRoutes(output) {
    const routes = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        routes.push(trimmed);
      }
    }
    
    return routes;
  }

  // Teste de conectividade completo
  async runConnectivityTest() {
    this.logger.info('Executando teste de conectividade completo...');
    
    const results = {
      timestamp: new Date().toISOString(),
      externalIP: null,
      dns: {},
      connectivity: {},
      speed: null
    };

    try {
      // IP externo
      results.externalIP = await this.getExternalIP();
      
      // Teste DNS
      const dnsHosts = ['google.com', 'cloudflare.com', '8.8.8.8'];
      for (const host of dnsHosts) {
        try {
          const ip = await this.resolveDNS(host);
          results.dns[host] = { success: true, ip };
        } catch (error) {
          results.dns[host] = { success: false, error: error.message };
        }
      }
      
      // Teste de conectividade
      const connectivityTests = [
        { host: 'google.com', port: 80 },
        { host: 'cloudflare.com', port: 80 },
        { host: '8.8.8.8', port: 53 }
      ];
      
      for (const test of connectivityTests) {
        const connected = await this.checkConnectivity(test.host, test.port);
        results.connectivity[`${test.host}:${test.port}`] = connected;
      }
      
      // Teste de velocidade
      results.speed = await this.checkSpeed();
      
      this.logger.info('Teste de conectividade concluído');
      return results;
      
    } catch (error) {
      this.logger.error('Erro no teste de conectividade:', error);
      results.error = error.message;
      return results;
    }
  }
}
