// src/streaming/FFmpegHLSManager.js
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import Logger from '../utils/Logger.js';

export default class FFmpegHLSManager {
  constructor() {
    this.logger = new Logger('FFmpegHLS');
    this.activeProcesses = new Map();
    this.hlsDir = '/app/hls'; // Diretório para arquivos HLS
    
    // Criar diretório HLS se não existir
    if (!fs.existsSync(this.hlsDir)) {
      fs.mkdirSync(this.hlsDir, { recursive: true });
    }
  }

  /**
   * Inicia FFmpeg para converter pipe → HLS
   * @param {string} pipePath - Caminho da named pipe
   * @param {string} siteId - ID do site (para organizar arquivos)
   * @param {object} options - Opções de configuração
   * @returns {Promise<string>} - Caminho do playlist .m3u8
   */
  async startHLSConversion(pipePath, siteId, options = {}) {
    const {
      segmentDuration = 6,      // Duração de cada segmento .ts (segundos)
      playlistSize = 5,          // Número de segmentos no playlist
      deleteThreshold = 10,      // Deletar segmentos após N segmentos novos
      hlsFlags = 'delete_segments+append_list+omit_endlist',
      videoCodec = 'copy',       // 'copy' = não recodificar
      audioCodec = 'copy',
      format = 'mpegts',         // Formato de entrada (pipe)
      outputFormat = 'hls'
    } = options;

    try {
      // Criar diretório específico para o site
      const siteHlsDir = path.join(this.hlsDir, siteId);
      if (!fs.existsSync(siteHlsDir)) {
        fs.mkdirSync(siteHlsDir, { recursive: true });
      }

      // Caminhos dos arquivos HLS
      const playlistPath = path.join(siteHlsDir, 'stream.m3u8');
      const segmentPattern = path.join(siteHlsDir, 'segment_%03d.ts');

      this.logger.info(`🎬 Iniciando FFmpeg HLS para ${siteId}`);
      this.logger.info(`📂 Pipe: ${pipePath}`);
      this.logger.info(`📂 HLS Dir: ${siteHlsDir}`);
      this.logger.info(`📝 Playlist: ${playlistPath}`);

      // Verificar se pipe existe
      if (!fs.existsSync(pipePath)) {
        throw new Error(`Pipe não existe: ${pipePath}`);
      }

      // Argumentos FFmpeg
      const ffmpegArgs = [
        // Input
        '-y',                              // Sobrescrever arquivos
        '-fflags', '+genpts+igndts',       // Gerar timestamps
        '-thread_queue_size', '512',       // Buffer de entrada
        '-f', format,                      // Formato de entrada
        '-i', pipePath,                    // Input: named pipe
        
        // Video codec
        '-c:v', videoCodec,                // Copy = não recodificar
        
        // Audio codec
        '-c:a', audioCodec,
        
        // HLS Options
        '-f', outputFormat,
        '-hls_time', segmentDuration.toString(),
        '-hls_list_size', playlistSize.toString(),
        '-hls_delete_threshold', deleteThreshold.toString(),
        '-hls_flags', hlsFlags,
        '-hls_segment_filename', segmentPattern,
        
        // Timeshift/DVR (opcional)
        '-hls_playlist_type', 'event',     // 'event' ou 'vod' para DVR
        
        // Performance
        '-max_muxing_queue_size', '1024',
        '-preset', 'ultrafast',            // Baixa latência
        '-tune', 'zerolatency',
        
        // Output
        playlistPath
      ];

      this.logger.info(`🔧 Comando FFmpeg: ffmpeg ${ffmpegArgs.join(' ')}`);

      // Iniciar processo FFmpeg
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const processId = `${siteId}_${Date.now()}`;

      // Event: Spawn bem-sucedido
      ffmpegProcess.on('spawn', () => {
        this.logger.info(`✅ FFmpeg iniciado (PID: ${ffmpegProcess.pid}) - ${siteId}`);
      });

      // Event: STDOUT (informações do FFmpeg)
      ffmpegProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('frame=')) {
          this.logger.debug(`[FFmpeg STDOUT] ${output}`);
        }
      });

      // Event: STDERR (logs principais do FFmpeg)
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Detectar erros críticos
        if (output.includes('error') || output.includes('Error')) {
          this.logger.error(`[FFmpeg ERROR] ${output.trim()}`);
        }
        // Detectar avisos
        else if (output.includes('warning') || output.includes('Warning')) {
          this.logger.warn(`[FFmpeg WARN] ${output.trim()}`);
        }
        // Logs de progresso (frame rate, bitrate)
        else if (output.includes('frame=') || output.includes('fps=')) {
          // Log apenas a cada 100 frames para não poluir
          if (Math.random() < 0.01) {
            this.logger.debug(`[FFmpeg] ${output.trim()}`);
          }
        }
        // Outros logs importantes
        else if (output.includes('Opening') || output.includes('Input') || output.includes('Output')) {
          this.logger.info(`[FFmpeg] ${output.trim()}`);
        }
      });

      // Event: Close
      ffmpegProcess.on('close', (code) => {
        this.logger.info(`⏹️ FFmpeg encerrado com código ${code} - ${siteId}`);
        this.activeProcesses.delete(processId);
      });

      // Event: Error
      ffmpegProcess.on('error', (error) => {
        this.logger.error(`❌ Erro no FFmpeg (${siteId}): ${error.message}`);
        this.activeProcesses.delete(processId);
      });

      // Salvar referência do processo
      this.activeProcesses.set(processId, {
        ffmpeg: ffmpegProcess,
        siteId,
        pipePath,
        playlistPath,
        siteHlsDir,
        startTime: Date.now()
      });

      // Aguardar playlist ser criado (timeout 30s)
      await this.waitForPlaylist(playlistPath, 30000);

      this.logger.info(`✅ HLS pronto para ${siteId}: ${playlistPath}`);

      return {
        processId,
        playlistPath,
        playlistUrl: `/hls/${siteId}/stream.m3u8`,
        siteHlsDir
      };

    } catch (error) {
      this.logger.error(`❌ Erro ao iniciar FFmpeg HLS: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aguarda playlist ser criado
   */
  async waitForPlaylist(playlistPath, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (fs.existsSync(playlistPath)) {
        // Verificar se tem conteúdo
        const content = fs.readFileSync(playlistPath, 'utf8');
        if (content.includes('#EXTM3U') && content.includes('.ts')) {
          this.logger.info(`✅ Playlist criado e válido: ${playlistPath}`);
          return true;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error(`Timeout aguardando playlist: ${playlistPath}`);
  }

  /**
   * Para um processo FFmpeg específico
   */
  stopProcess(processId) {
    const process = this.activeProcesses.get(processId);
    
    if (process) {
      this.logger.info(`🛑 Parando FFmpeg: ${processId}`);
      
      // Enviar SIGTERM
      if (process.ffmpeg && !process.ffmpeg.killed) {
        process.ffmpeg.kill('SIGTERM');
        
        // Força SIGKILL após 5s se não terminar
        setTimeout(() => {
          if (!process.ffmpeg.killed) {
            this.logger.warn(`⚠️ FFmpeg não respondeu ao SIGTERM, forçando SIGKILL`);
            process.ffmpeg.kill('SIGKILL');
          }
        }, 5000);
      }
      
      // Limpar arquivos HLS (opcional)
      this.cleanupHLS(process.siteHlsDir);
      
      this.activeProcesses.delete(processId);
      return true;
    }
    
    return false;
  }

  /**
   * Para todos os processos FFmpeg
   */
  stopAllProcesses() {
    this.logger.info('🛑 Parando todos os processos FFmpeg...');
    
    const processIds = Array.from(this.activeProcesses.keys());
    processIds.forEach(id => this.stopProcess(id));
    
    this.activeProcesses.clear();
    this.logger.info('✅ Todos os processos FFmpeg parados');
  }

  /**
   * Limpa arquivos HLS de um site
   */
  cleanupHLS(siteHlsDir) {
    try {
      if (fs.existsSync(siteHlsDir)) {
        const files = fs.readdirSync(siteHlsDir);
        
        files.forEach(file => {
          const filePath = path.join(siteHlsDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            this.logger.debug(`Erro ao remover ${filePath}: ${e.message}`);
          }
        });
        
        // Remover diretório
        fs.rmdirSync(siteHlsDir);
        this.logger.debug(`🗑️ Cleanup HLS concluído: ${siteHlsDir}`);
      }
    } catch (error) {
      this.logger.warn(`⚠️ Erro no cleanup HLS: ${error.message}`);
    }
  }

  /**
   * Obter estatísticas de um processo
   */
  getProcessStats(processId) {
    const process = this.activeProcesses.get(processId);
    
    if (!process) {
      return null;
    }
    
    const uptime = Date.now() - process.startTime;
    
    // Ler informações do playlist
    let segmentCount = 0;
    let playlistSize = 0;
    
    try {
      if (fs.existsSync(process.playlistPath)) {
        const content = fs.readFileSync(process.playlistPath, 'utf8');
        segmentCount = (content.match(/\.ts/g) || []).length;
        playlistSize = fs.statSync(process.playlistPath).size;
      }
    } catch (e) {
      this.logger.debug(`Erro ao ler stats do playlist: ${e.message}`);
    }
    
    return {
      processId,
      siteId: process.siteId,
      uptime,
      ffmpegPid: process.ffmpeg?.pid || null,
      ffmpegAlive: process.ffmpeg && !process.ffmpeg.killed,
      playlistPath: process.playlistPath,
      playlistUrl: `/hls/${process.siteId}/stream.m3u8`,
      segmentCount,
      playlistSize,
      hlsDir: process.siteHlsDir
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
   * Verificar saúde de um processo
   */
  checkHealth(processId) {
    const process = this.activeProcesses.get(processId);
    
    if (!process) {
      return { healthy: false, reason: 'Processo não encontrado' };
    }
    
    // Verificar se FFmpeg está vivo
    if (!process.ffmpeg || process.ffmpeg.killed) {
      return { healthy: false, reason: 'FFmpeg não está rodando' };
    }
    
    // Verificar se playlist existe
    if (!fs.existsSync(process.playlistPath)) {
      return { healthy: false, reason: 'Playlist não existe' };
    }
    
    // Verificar se playlist está sendo atualizado (modificado recentemente)
    try {
      const stats = fs.statSync(process.playlistPath);
      const lastModified = stats.mtimeMs;
      const timeSinceModified = Date.now() - lastModified;
      
      // Se não foi modificado em 30s, pode ter problema
      if (timeSinceModified > 30000) {
        return { 
          healthy: false, 
          reason: `Playlist não atualizado há ${Math.round(timeSinceModified / 1000)}s` 
        };
      }
    } catch (e) {
      return { healthy: false, reason: 'Erro ao verificar playlist' };
    }
    
    return { healthy: true, reason: 'OK' };
  }
}
