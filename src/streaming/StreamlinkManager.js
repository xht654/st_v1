// src/streaming/StreamlinkManager.js
import { spawn } from 'child_process';
import fs from 'fs';
import Logger from '../utils/Logger.js';

export default class StreamlinkManager {
  constructor() {
    this.logger = new Logger('StreamlinkManager');
    this.activeProcesses = new Map();
  }

  /**
   * Inicia streaming para Named Pipe (será lido pelo FFmpeg)
   * @param {string} streamUrl - URL do stream
   * @param {string} outputPath - Caminho da named pipe
   * @param {object} options - Opções de configuração
   * @returns {Promise<string>} - ID do processo
   */
  async streamToPipe(streamUrl, outputPath, options = {}) {
    const {
      quality = 'best',
      referer = null,
      userAgent = null,
      retryStreams = 3,
      retryMax = 5,
      customArgs = '',
      timeout = 600
    } = options;

    try {
      this.logger.info(`🚀 Iniciando Streamlink para PIPE: ${outputPath}`);
      
      // 1. CRIAR PIPE
      await this.createPipe(outputPath);
      
      // 2. ARGUMENTOS STREAMLINK
      const streamlinkArgs = [
        '--loglevel', 'info',
        '--output', outputPath,        // ← Output: named pipe
        '--force',
        '--retry-streams', retryStreams.toString(),
        '--retry-max', retryMax.toString(),
      ];

      // Referer
      if (referer) {
        streamlinkArgs.push('--http-header', `Referer=${referer}`);
        this.logger.info(`🔗 Usando referer: ${referer}`);
      }

      // User Agent
      if (userAgent) {
        streamlinkArgs.push('--http-header', `User-Agent=${userAgent}`);
      }

      // Argumentos personalizados
      if (customArgs && customArgs.trim()) {
        const customArgArray = customArgs.trim().split(/\s+/);
        streamlinkArgs.push(...customArgArray);
        this.logger.info(`⚙️ Argumentos personalizados: ${customArgs}`);
      }

      // URL e qualidade
      streamlinkArgs.push(streamUrl, quality);

      const streamlinkCmd = `streamlink ${streamlinkArgs.join(' ')}`;
      this.logger.info(`📝 Comando: ${streamlinkCmd.substring(0, 200)}...`);

      // 3. INICIAR STREAMLINK
      return new Promise((resolve, reject) => {
        const streamlinkProcess = spawn('streamlink', streamlinkArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        const processId = `streamlink_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        let processStarted = false;
        let hasError = false;
        const startTime = Date.now();

        // Guardar referência
        this.activeProcesses.set(processId, {
          streamlink: streamlinkProcess,
          pipePath: outputPath,
          startTime: Date.now(),
          streamUrl
        });

        // Event: Spawn
        streamlinkProcess.on('spawn', () => {
          this.logger.info(`✅ Streamlink spawned (PID: ${streamlinkProcess.pid})`);
          processStarted = true;
        });

        // Event: STDOUT
        streamlinkProcess.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output && !output.includes('[download]')) {
            this.logger.debug(`[Streamlink STDOUT] ${output}`);
          }
        });

        // Event: STDERR (logs principais)
        streamlinkProcess.stderr.on('data', (data) => {
          const output = data.toString();
          
          // Detectar quando começa a escrever na pipe
          if (output.includes('Opening stream') || output.includes('Writing output')) {
            if (!processStarted) {
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              this.logger.info(`✅ Streamlink começou a escrever na pipe após ${elapsed}s`);
              processStarted = true;
              resolve(processId); // ✅ Resolver assim que começar
            }
          }

          // Detectar erros
          if (output.includes('error:') || output.includes('Failed to')) {
            this.logger.error(`❌ Streamlink ERROR: ${output.trim()}`);
            hasError = true;
          }
          // Avisos
          else if (output.includes('warning') || output.includes('Unable to')) {
            this.logger.warn(`⚠️ Streamlink WARN: ${output.trim()}`);
          }
          // Info importante
          else if (output.includes('[cli][info]')) {
            const cleanOutput = output.replace('[cli][info]', '').trim();
            if (cleanOutput && !cleanOutput.includes('segment')) {
              this.logger.info(`📡 ${cleanOutput}`);
            }
          }
          // Debug (muito verboso, filtrar)
          else if (!output.includes('segment') && !output.includes('[download]')) {
            this.logger.debug(`[Streamlink] ${output.trim()}`);
          }
        });

        // Event: Close
        streamlinkProcess.on('close', (code) => {
          const duration = Math.round((Date.now() - startTime) / 1000);
          this.logger.info(`⏹️ Streamlink encerrado com código ${code} após ${duration}s`);
          
          this.activeProcesses.delete(processId);
          
          // Se fechou antes de resolver, é erro
          if (!processStarted) {
            reject(new Error(`Streamlink falhou ao iniciar (código ${code})`));
          }
        });

        // Event: Error
        streamlinkProcess.on('error', (error) => {
          this.logger.error(`❌ Erro ao iniciar Streamlink: ${error.message}`);
          this.activeProcesses.delete(processId);
          
          if (!processStarted) {
            reject(error);
          }
        });

        // Timeout de inicialização (30s)
        setTimeout(() => {
          if (!processStarted && !hasError) {
            this.logger.warn(`⏱️ Streamlink não iniciou em 30s, mas continuando...`);
            resolve(processId); // Resolver mesmo assim
          }
        }, 30000);

        // Timeout global
        const globalTimeout = setTimeout(() => {
          if (!streamlinkProcess.killed) {
            this.logger.warn(`⏱️ Timeout após ${timeout}s - encerrando Streamlink`);
            streamlinkProcess.kill('SIGTERM');
            
            setTimeout(() => {
              if (!streamlinkProcess.killed) {
                streamlinkProcess.kill('SIGKILL');
              }
            }, 5000);
          }
        }, timeout * 1000);

        streamlinkProcess.on('close', () => {
          clearTimeout(globalTimeout);
        });
      });

    } catch (error) {
      this.logger.error(`❌ Erro ao iniciar streaming: ${error.message}`);
      throw error;
    }
  }

  /**
   * Criar named pipe
   */
  async createPipe(pipePath) {
    try {
      // Remover pipe antiga se existir
      if (fs.existsSync(pipePath)) {
        const stats = fs.statSync(pipePath);
        
        if (stats.isFIFO()) {
          this.logger.debug(`🗑️ Removendo pipe antiga: ${pipePath}`);
          fs.unlinkSync(pipePath);
        } else {
          this.logger.warn(`⚠️ ${pipePath} não é uma pipe, removendo arquivo`);
          fs.unlinkSync(pipePath);
        }
      }

      // Criar nova pipe
      const { execSync } = await import('child_process');
      execSync(`mkfifo "${pipePath}"`);
      fs.chmodSync(pipePath, 0o666);
      
      this.logger.info(`✅ Named pipe criada: ${pipePath}`);
      
      // Verificar se foi criada corretamente
      const stats = fs.statSync(pipePath);
      if (!stats.isFIFO()) {
        throw new Error('Falha ao criar pipe: arquivo criado não é FIFO');
      }
      
      return true;
    } catch (error) {
      this.logger.error(`❌ Erro ao criar pipe: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parar processo específico
   */
  stopProcess(processId) {
    const process = this.activeProcesses.get(processId);
    
    if (process) {
      this.logger.info(`🛑 Parando Streamlink: ${processId}`);
      
      // Parar Streamlink
      if (process.streamlink && !process.streamlink.killed) {
        process.streamlink.kill('SIGTERM');
        
        // Força SIGKILL após 5s
        setTimeout(() => {
          if (!process.streamlink.killed) {
            this.logger.warn(`⚠️ Streamlink não respondeu, forçando SIGKILL`);
            process.streamlink.kill('SIGKILL');
          }
        }, 5000);
      }
      
      // Remover pipe
      if (process.pipePath && fs.existsSync(process.pipePath)) {
        try {
          fs.unlinkSync(process.pipePath);
          this.logger.debug(`🗑️ Pipe removida: ${process.pipePath}`);
        } catch (error) {
          this.logger.warn(`⚠️ Erro ao remover pipe: ${error.message}`);
        }
      }
      
      this.activeProcesses.delete(processId);
      return true;
    }
    
    return false;
  }

  /**
   * Parar todos os processos
   */
  stopAllProcesses() {
    this.logger.info('🛑 Parando todos os processos Streamlink...');
    
    const processIds = Array.from(this.activeProcesses.keys());
    processIds.forEach(id => this.stopProcess(id));
    
    this.activeProcesses.clear();
    this.logger.info('✅ Todos os processos Streamlink parados');
  }

  /**
   * Obter estatísticas de um processo
   */
  getProcessStats(processId) {
    const process = this.activeProcesses.get(processId);
    
    if (!process) {
      return null;
    }
    
    return {
      processId,
      uptime: Date.now() - process.startTime,
      streamlinkPid: process.streamlink?.pid || null,
      streamlinkAlive: process.streamlink && !process.streamlink.killed,
      pipePath: process.pipePath,
      streamUrl: process.streamUrl
    };
  }

  /**
   * Obter estatísticas de todos os processos
   */
  getAllStats() {
    const stats = [];
    
    for (const [processId, _] of this.activeProcesses) {
      const stat = this.getProcessStats(processId);
      if (stat) {
        stats.push(stat);
      }
    }
    
    return stats;
  }

  /**
   * Obter qualidades disponíveis (útil para debug/config)
   */
  async getAvailableQualities(streamUrl, referer = null) {
    const args = [streamUrl, '--json'];
    
    if (referer) {
      args.splice(1, 0, '--http-header', `Referer=${referer}`);
    }

    return new Promise((resolve, reject) => {
      const process = spawn('streamlink', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const streamInfo = JSON.parse(output);
            const qualities = Object.keys(streamInfo.streams || {});
            resolve(qualities);
          } catch (error) {
            reject(new Error('Erro ao parsear informações do stream'));
          }
        } else {
          reject(new Error(`Streamlink falhou com código ${code}`));
        }
      });

      process.on('error', reject);
      
      // Timeout 30s
      setTimeout(() => {
        if (!process.killed) {
          process.kill();
          reject(new Error('Timeout ao obter qualidades'));
        }
      }, 30000);
    });
  }

  /**
   * Testar se Streamlink consegue abrir uma URL
   */
  async testStreamUrl(streamUrl, referer = null) {
    this.logger.info(`🧪 Testando URL: ${streamUrl}`);
    
    try {
      const qualities = await this.getAvailableQualities(streamUrl, referer);
      
      this.logger.info(`✅ Stream válido - Qualidades: ${qualities.join(', ')}`);
      
      return {
        success: true,
        qualities,
        message: 'Stream acessível'
      };
    } catch (error) {
      this.logger.error(`❌ Teste falhou: ${error.message}`);
      
      return {
        success: false,
        qualities: [],
        message: error.message
      };
    }
  }

  /**
   * Verificar se Streamlink está instalado
   */
  async checkStreamlinkInstalled() {
    return new Promise((resolve) => {
      const process = spawn('streamlink', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let output = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          const version = output.trim().split('\n')[0];
          this.logger.info(`✅ Streamlink instalado: ${version}`);
          resolve({ installed: true, version });
        } else {
          this.logger.error('❌ Streamlink não encontrado');
          resolve({ installed: false, version: null });
        }
      });
      
      process.on('error', () => {
        resolve({ installed: false, version: null });
      });
    });
  }

  /**
   * Verificar saúde de um processo
   */
  checkHealth(processId) {
    const process = this.activeProcesses.get(processId);
    
    if (!process) {
      return { healthy: false, reason: 'Processo não encontrado' };
    }
    
    // Verificar se processo está vivo
    if (!process.streamlink || process.streamlink.killed) {
      return { healthy: false, reason: 'Streamlink não está rodando' };
    }
    
    // Verificar se pipe ainda existe
    if (!fs.existsSync(process.pipePath)) {
      return { healthy: false, reason: 'Pipe não existe' };
    }
    
    // Verificar uptime (se muito novo, pode ainda estar iniciando)
    const uptime = Date.now() - process.startTime;
    if (uptime < 5000) {
      return { healthy: true, reason: 'Iniciando...' };
    }
    
    return { healthy: true, reason: 'OK' };
  }

  /**
   * Limpar recursos (chamado no shutdown)
   */
  async cleanup() {
    this.logger.info('🧹 Limpando recursos Streamlink...');
    
    this.stopAllProcesses();
    
    // Limpar pipes órfãs
    const timeshiftDir = '/app/timeshift';
    if (fs.existsSync(timeshiftDir)) {
      const files = fs.readdirSync(timeshiftDir);
      
      files.forEach(file => {
        if (file.endsWith('.pipe')) {
          const pipePath = `${timeshiftDir}/${file}`;
          try {
            fs.unlinkSync(pipePath);
            this.logger.debug(`🗑️ Pipe órfã removida: ${file}`);
          } catch (e) {
            // Ignorar erros
          }
        }
      });
    }
    
    this.logger.info('✅ Cleanup concluído');
  }
}
