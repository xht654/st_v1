import fs from 'fs';
import path from 'path';
import http from 'http';
import Logger from '../utils/Logger.js';

export default class TVHeadendIntegration {
  constructor(configManager) {
    this.configManager = configManager;
    this.logger = new Logger('TVHeadend');
    this.timeshift_dir = '/app/timeshift';
  }

  // Criar canal pipe para TVHeadend
  async createPipeChannel(channelName, pipePath) {
    try {
      const m3uContent = `#EXTM3U
#EXTINF:-1 tvg-id="${channelName}" tvg-name="${channelName}" group-title="Live Streams",${channelName}
pipe://${pipePath}
`;
      
      const m3uPath = path.join(this.timeshift_dir, `${channelName}.m3u`);
      fs.writeFileSync(m3uPath, m3uContent);
      
      this.logger.info(`Canal pipe criado: ${channelName}`);
      return m3uPath;
    } catch (error) {
      this.logger.error(`Erro ao criar canal pipe: ${error.message}`);
      throw error;
    }
  }

  // Criar canal HTTP para TVHeadend
  async createHttpChannel(channelName, httpUrl) {
    try {
      const m3uContent = `#EXTM3U
#EXTINF:-1 tvg-id="${channelName}" tvg-name="${channelName}" group-title="Live Streams HTTP",${channelName}
${httpUrl}
`;
      
      const m3uPath = path.join(this.timeshift_dir, `${channelName}.m3u`);
      fs.writeFileSync(m3uPath, m3uContent);
      
      this.logger.info(`Canal HTTP criado: ${channelName}`);
      return m3uPath;
    } catch (error) {
      this.logger.error(`Erro ao criar canal HTTP: ${error.message}`);
      throw error;
    }
  }

  // Remover canal
  async removeChannel(channelName) {
    try {
      const m3uPath = path.join(this.timeshift_dir, `${channelName}.m3u`);
      if (fs.existsSync(m3uPath)) {
        fs.unlinkSync(m3uPath);
        this.logger.info(`Canal removido: ${channelName}`);
      }
    } catch (error) {
      this.logger.error(`Erro ao remover canal: ${error.message}`);
    }
  }

  // Verificar se pipe está ativo
  async isPipeActive(pipePath) {
    try {
      return fs.existsSync(pipePath);
    } catch (error) {
      return false;
    }
  }

  // Verificar conectividade com TVHeadend
  async checkConnectivity() {
    const credentials = this.configManager.getTVHeadendCredentials();
    
    return new Promise((resolve) => {
      const options = {
        hostname: credentials.host,
        port: credentials.port,
        path: '/api/status',
        method: 'GET',
        timeout: 5000
      };

      if (credentials.username && credentials.password) {
        const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        options.headers = { 'Authorization': `Basic ${auth}` };
      }

      const req = http.request(options, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => resolve(false));
      req.setTimeout(5000);
      req.end();
    });
  }

  // Obter lista de canais ativos
  getActiveChannels() {
    try {
      const files = fs.readdirSync(this.timeshift_dir);
      return files
        .filter(file => file.endsWith('.m3u'))
        .map(file => path.basename(file, '.m3u'));
    } catch (error) {
      this.logger.error('Erro ao listar canais:', error);
      return [];
    }
  }

  // Cleanup de arquivos antigos
  cleanup() {
    try {
      const files = fs.readdirSync(this.timeshift_dir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 horas

      files.forEach(file => {
        if (file.endsWith('.pipe') || file.endsWith('.m3u')) {
          const filePath = path.join(this.timeshift_dir, file);
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            try {
              fs.unlinkSync(filePath);
              this.logger.debug(`Arquivo antigo removido: ${file}`);
            } catch (e) {}
          }
        }
      });
    } catch (error) {
      this.logger.error('Erro no cleanup:', error);
    }
  }
}
