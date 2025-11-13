import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';

export default class Utils {
  // Delay/sleep function
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Gerar ID único
  static generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${prefix}${timestamp}_${random}`;
  }

  // Validar URL
  static isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  // Sanitizar nome de arquivo
  static sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .toLowerCase();
  }

  // Formatar bytes
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Formatar duração
  static formatDuration(ms) {
    if (ms < 0) return '00:00:00';
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Debounce function
  static debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func(...args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func(...args);
    };
  }

  // Throttle function
  static throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Deep clone object
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
    if (typeof obj === 'object') {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = Utils.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  }

  // Merge objects deeply
  static deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = Utils.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  // Retry with exponential backoff
  static async retry(fn, maxAttempts = 3, baseDelay = 1000, maxDelay = 10000) {
    let attempt = 1;
    
    while (attempt <= maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        await Utils.sleep(delay);
        attempt++;
      }
    }
  }

  // Verificar se arquivo existe
  static async fileExists(filePath) {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // Criar diretório se não existir
  static async ensureDir(dirPath) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      throw new Error(`Erro ao criar diretório ${dirPath}: ${error.message}`);
    }
  }

  // Ler arquivo JSON
  static async readJsonFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Erro ao ler arquivo JSON ${filePath}: ${error.message}`);
    }
  }

  // Escrever arquivo JSON
  static async writeJsonFile(filePath, data, pretty = true) {
    try {
      const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
      await fs.promises.writeFile(filePath, content, 'utf8');
      return true;
    } catch (error) {
      throw new Error(`Erro ao escrever arquivo JSON ${filePath}: ${error.message}`);
    }
  }

  // Calcular hash MD5
  static calculateMD5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // Calcular hash SHA256
  static calculateSHA256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Gerar hash de arquivo
  static async calculateFileHash(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // Validar JSON
  static isValidJSON(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  // Extrair domínio de URL
  static extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  // Normalizar URL
  static normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  // Validar email
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Escapar regex
  static escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Chunks array
  static chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Remove duplicatas de array
  static removeDuplicates(array, key = null) {
    if (key) {
      const seen = new Set();
      return array.filter(item => {
        const value = item[key];
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    }
    return [...new Set(array)];
  }

  // Shuffle array
  static shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Parse user agent
  static parseUserAgent(userAgent) {
    const ua = userAgent.toLowerCase();
    
    const browsers = [
      { name: 'chrome', pattern: /chrome\/([0-9.]+)/ },
      { name: 'firefox', pattern: /firefox\/([0-9.]+)/ },
      { name: 'safari', pattern: /safari\/([0-9.]+)/ },
      { name: 'edge', pattern: /edge\/([0-9.]+)/ }
    ];
    
    for (const browser of browsers) {
      const match = ua.match(browser.pattern);
      if (match) {
        return {
          name: browser.name,
          version: match[1]
        };
      }
    }
    
    return { name: 'unknown', version: 'unknown' };
  }

  // Gerar User-Agent aleatório
  static generateRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  // Verificar se é desenvolvimento
  static isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  // Verificar se é produção
  static isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  // Obter informações do sistema
  static getSystemInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid
    };
  }

  // Limpar string para uso como filename
  static sanitizeForFilename(str) {
    return str
      .replace(/[^\w\s-]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-')     // Substitui espaços por hífens
      .toLowerCase()
      .substring(0, 50);        // Limita tamanho
  }

  // Validar configuração de site
  static validateSiteConfig(config) {
    const required = ['name', 'url'];
    const missing = required.filter(field => !config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Campos obrigatórios ausentes: ${missing.join(', ')}`);
    }
    
    if (!Utils.isValidUrl(config.url)) {
      throw new Error('URL inválida');
    }
    
    return true;
  }

  // Rate limiter simples
  static createRateLimiter(maxRequests, windowMs) {
    const requests = new Map();
    
    return function rateLimiter(key) {
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!requests.has(key)) {
        requests.set(key, []);
      }
      
      const keyRequests = requests.get(key);
      
      // Remove requests antigas
      while (keyRequests.length > 0 && keyRequests[0] < windowStart) {
        keyRequests.shift();
      }
      
      if (keyRequests.length >= maxRequests) {
        return false; // Rate limit exceeded
      }
      
      keyRequests.push(now);
      return true; // Request allowed
    };
  }

  // Timeout promise
  static withTimeout(promise, timeoutMs, errorMessage = 'Operation timed out') {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }

  // Cleanup resources
  static cleanup() {
    // Cleanup pode ser usado para limpar recursos globais
    if (global.gc) {
      global.gc();
    }
  }
}
