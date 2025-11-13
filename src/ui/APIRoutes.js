import express from 'express';
import Logger from '../utils/Logger.js';

export default class APIRoutes {
  constructor(configManager, sessionManager, vpnManager) {
    this.configManager = configManager;
    this.sessionManager = sessionManager;
    this.vpnManager = vpnManager;
    this.logger = new Logger('API');
    this.router = express.Router();
    this.setupRoutes();
  }

  getRouter() {
    return this.router;
  }

  setupRoutes() {
    // Status do sistema
    this.router.get('/status', async (req, res) => {
      try {
        const sessions = this.sessionManager.getSessionsStatus();
        const vpnStatus = this.vpnManager.getStatus();
        
        res.json({
          api: true,
          sessions: {
            total: Object.keys(sessions).length,
            active: Object.values(sessions).filter(s => s.isRunning).length,
            details: sessions
          },
          vpn: vpnStatus,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === ROTAS VPN ===
    
    // Status da VPN
    this.router.get('/vpn/status', (req, res) => {
      res.json(this.vpnManager.getStatus());
    });

    // Conectar VPN
    this.router.post('/vpn/connect', async (req, res) => {
      try {
        const success = await this.vpnManager.connect();
        res.json({ 
          success, 
          message: success ? 'VPN conectada' : 'Falha ao conectar VPN' 
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Desconectar VPN
    this.router.post('/vpn/disconnect', async (req, res) => {
      try {
        await this.vpnManager.disconnect();
        res.json({ success: true, message: 'VPN desconectada' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Configurar VPN
    this.router.post('/vpn/config', async (req, res) => {
      try {
        const vpnConfig = req.body;
        this.configManager.setVPNConfig(vpnConfig);
        await this.configManager.saveConfig();
        
        res.json({ success: true, message: 'Configuração VPN salva' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // === ROTAS DE SESSÕES ===
    
    // Listar todas as sessões
    this.router.get('/sessions', (req, res) => {
      const sessions = this.sessionManager.getSessionsStatus();
      res.json(sessions);
    });

    // Iniciar sessão específica
    this.router.post('/sessions/:siteId/start', async (req, res) => {
      try {
        const { siteId } = req.params;
        const config = this.configManager.config;
        const site = config.sites[siteId];
        
        if (!site) {
          return res.status(404).json({ error: 'Site não encontrado' });
        }
        
        await this.sessionManager.startSiteCapture({ id: siteId, ...site });
        res.json({ success: true, message: `Sessão ${siteId} iniciada` });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Parar sessão específica
    this.router.post('/sessions/:siteId/stop', async (req, res) => {
      try {
        const { siteId } = req.params;
        await this.sessionManager.stopSession(siteId);
        res.json({ success: true, message: `Sessão ${siteId} parada` });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Iniciar captura paralela
    this.router.post('/sessions/start-parallel', async (req, res) => {
      try {
        const { siteIds = [] } = req.body;
        const result = await this.sessionManager.startParallelCapture(siteIds);
        res.json({ 
          success: true, 
          message: 'Captura paralela iniciada',
          result 
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Parar todas as sessões
    this.router.post('/sessions/stop-all', async (req, res) => {
      try {
        await this.sessionManager.stopAllSessions();
        res.json({ success: true, message: 'Todas as sessões paradas' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // === ROTAS DE CONFIGURAÇÃO ===
    
    // Obter configuração completa
    this.router.get('/config', (req, res) => {
      res.json(this.configManager.config);
    });

    // Atualizar configuração
    this.router.post('/config', async (req, res) => {
      try {
        this.configManager.config = req.body;
        await this.configManager.saveConfig();
        res.json({ success: true, message: 'Configuração atualizada' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Configurações do TVHeadend
    this.router.get('/tvheadend', (req, res) => {
      const credentials = this.configManager.getTVHeadendCredentials();
      // Não retornar a senha por segurança
      res.json({
        host: credentials.host,
        port: credentials.port,
        username: credentials.username,
        hasPassword: !!credentials.password
      });
    });

    this.router.post('/tvheadend', async (req, res) => {
      try {
        const { username, password } = req.body;
        this.configManager.setTVHeadendCredentials(username, password);
        await this.configManager.saveConfig();
        res.json({ success: true, message: 'Credenciais TVHeadend salvas' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // === ROTAS DE SITES ===
    
    // Listar sites
    this.router.get('/sites', (req, res) => {
      res.json(this.configManager.config.sites || {});
    });

    // Criar/atualizar site
    this.router.post('/sites/:id', async (req, res) => {
      try {
        const siteId = req.params.id;
        const siteData = req.body;
        
        if (!this.configManager.config.sites) {
          this.configManager.config.sites = {};
        }
        
        this.configManager.config.sites[siteId] = siteData;
        await this.configManager.saveConfig();
        
        res.json({ success: true, message: `Site ${siteId} salvo` });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Deletar site
    this.router.delete('/sites/:id', async (req, res) => {
      try {
        const siteId = req.params.id;
        
        if (this.configManager.config.sites && this.configManager.config.sites[siteId]) {
          delete this.configManager.config.sites[siteId];
          await this.configManager.saveConfig();
          res.json({ success: true, message: `Site ${siteId} removido` });
        } else {
          res.status(404).json({ success: false, error: 'Site não encontrado' });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // === ROTAS DE DEBUG ===
    
    // URLs detectados
    this.router.get('/debug/urls/:siteId?', (req, res) => {
      try {
        const { siteId } = req.params;
        
        if (siteId) {
          // URLs de um site específico
          const session = this.sessionManager.activeSessions.get(siteId);
          if (!session || !session.streamDetector) {
            return res.status(404).json({ error: 'Sessão não encontrada' });
          }
          
          res.json({
            siteId,
            urls: session.streamDetector.getCapturedUrls(),
            pageContent: session.streamDetector.getPageContent(),
            timestamp: new Date().toISOString()
          });
        } else {
          // URLs de todas as sessões ativas
          const allUrls = {};
          
          for (const [id, session] of this.sessionManager.activeSessions) {
            if (session.streamDetector) {
              allUrls[id] = {
                urls: session.streamDetector.getCapturedUrls(),
                pageContent: session.streamDetector.getPageContent()
              };
            }
          }
          
          res.json({
            sessions: allUrls,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Logs do sistema
    this.router.get('/logs', (req, res) => {
      try {
        // Implementar leitura de logs
        res.json({ logs: 'Logs não implementados ainda' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Recarregar configuração
    this.router.post('/reload', async (req, res) => {
      try {
        await this.configManager.loadConfig();
        res.json({ success: true, message: 'Configuração recarregada' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  
  // === ROTAS DE LOGS === (ADICIONAR no setupRoutes())
    
    // Obter logs do sistema
    this.router.get('/logs', async (req, res) => {
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        // Tentar obter logs do Docker
        try {
          const { stdout } = await execAsync('docker-compose logs --tail=500 stream-capture');
          res.type('text/plain').send(stdout);
        } catch (dockerError) {
          // Fallback: logs do arquivo
          const fs = await import('fs');
          const logDir = '/app/logs';
          
          if (fs.existsSync(logDir)) {
            const logFiles = fs.readdirSync(logDir)
              .filter(f => f.endsWith('.log'))
              .sort()
              .reverse();
            
            if (logFiles.length > 0) {
              const logContent = fs.readFileSync(`${logDir}/${logFiles[0]}`, 'utf8');
              res.type('text/plain').send(logContent);
            } else {
              res.type('text/plain').send('Nenhum log disponível');
            }
          } else {
            res.type('text/plain').send('Diretório de logs não encontrado');
          }
        }
      } catch (error) {
        this.logger.error('Erro ao obter logs:', error);
        res.status(500).type('text/plain').send(`Erro ao carregar logs: ${error.message}`);
      }
    });
  
  }
}
