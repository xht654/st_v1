// src/core/StreamDetector.js - ATUALIZADO COM HEADERS CUSTOMIZADOS
import puppeteer from 'puppeteer';
import Logger from '../utils/Logger.js';

export default class StreamDetector {
  constructor(site) {
    this.site = site;
    this.logger = new Logger(`Detector:${site.id}`);
    this.capturedUrls = [];
    this.pageContent = {};
  }

  async detectStreams() {
    const method = this.site.captureMethod || 'advanced';
    
    this.logger.info(`Iniciando detecção ${method} para ${this.site.name}`);
    
    return method === 'simple' 
      ? await this.detectSimple()
      : await this.detectAdvanced();
  }

  async detectSimple() {
    let browser;
    let page;
    
    try {
      browser = await this.launchBrowser();
      page = await browser.newPage();
      
      const streams = { video: null, audio: null, combined: [] };
      
      await this.setupRequestInterception(page, streams, 'simple');
      await this.configurePage(page);
      
      // ✅ NOVO: Aplicar headers customizados
      await this.applyCustomHeaders(page);
      
      // Navegação simples
      await page.goto(this.site.url, { 
        waitUntil: "domcontentloaded",
        timeout: 15000 
      });
      
      // Capturar conteúdo da página
      await this.capturePageContent(page);
      
      // Aguardar detecção
      const waitTime = this.site.simpleCapture?.waitTime || 5000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Interação básica com player
      await this.interactWithPlayer(page);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      this.logger.info(`Detecção simples concluída: ${streams.combined.length} streams encontrados`);
      return streams;
      
    } catch (error) {
      this.logger.error('Erro na detecção simples:', error);
      throw error;
    } finally {
      await this.cleanup(browser);
    }
  }

  async detectAdvanced() {
    let browser;
    let page;
    
    try {
      browser = await this.launchBrowser();
      page = await browser.newPage();
      
      const streams = { video: null, audio: null, combined: [] };
      
      // Configurar proteções anti-ads
      await this.setupAdProtection(browser, page);
      await this.setupRequestInterception(page, streams, 'advanced');
      await this.configurePage(page);
      
      // ✅ NOVO: Aplicar headers customizados
      await this.applyCustomHeaders(page);
      
      // Navegação avançada
      await page.goto(this.site.url, { 
        waitUntil: "domcontentloaded",
        timeout: 25000 
      });
      
      // Capturar conteúdo da página
      await this.capturePageContent(page);
      
      // Fechar overlays e modals
      await this.closeOverlays(page);
      
      // Aguardar detecção automática
      const waitTime = this.site.waitTime || 10000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Interação avançada com player
      await this.interactWithPlayerAdvanced(page);
      
      // Aguardar streams adicionais
      await this.waitForAdditionalStreams(streams);
      
      this.logger.info(`Detecção avançada concluída: V:${!!streams.video} A:${!!streams.audio} C:${streams.combined.length}`);
      return streams;
      
    } catch (error) {
      this.logger.error('Erro na detecção avançada:', error);
      throw error;
    } finally {
      await this.cleanup(browser);
    }
  }

  // ✅ NOVO: Aplicar headers customizados no Puppeteer
  async applyCustomHeaders(page) {
    try {
      const customHeaders = this.site.customHeaders || {};
      
      // Se não houver headers customizados, retorna
      if (Object.keys(customHeaders).length === 0) {
        this.logger.debug('Nenhum header customizado definido');
        return;
      }
      
      // Log dos headers aplicados
      this.logger.info(`📋 Aplicando ${Object.keys(customHeaders).length} header(s) customizado(s)`);
      
      // Aplicar headers
      await page.setExtraHTTPHeaders(customHeaders);
      
      // Log detalhado (sem expor dados sensíveis)
      Object.keys(customHeaders).forEach(key => {
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
          this.logger.debug(`   ${key}: [OCULTO]`);
        } else {
          const value = customHeaders[key];
          const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
          this.logger.debug(`   ${key}: ${displayValue}`);
        }
      });
      
    } catch (error) {
      this.logger.warn(`⚠️ Erro ao aplicar headers customizados: ${error.message}`);
    }
  }

  async launchBrowser() {
    return await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor"
      ],
    });
  }

  async setupAdProtection(browser, page) {
    const adConfig = this.getAdProtectionConfig();
    
    // Bloquear pop-ups
    if (adConfig.blockPopups) {
      browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          const newPage = await target.page();
          if (newPage && newPage !== page) {
            this.logger.debug('Pop-up bloqueado');
            await newPage.close();
          }
        }
      });
      
      // JavaScript anti-popup
      await page.evaluateOnNewDocument(() => {
        window.open = () => null;
        window.alert = () => null;
        window.confirm = () => true;
        window.prompt = () => null;
        
        document.addEventListener('click', (e) => {
          if (e.target.tagName === 'A' && e.target.target === '_blank') {
            e.preventDefault();
            e.stopPropagation();
          }
        }, true);
      });
    }
  }

  async setupRequestInterception(page, streams, method) {
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      try {
        const url = req.url();
        const resourceType = req.resourceType();
        
        // Detectar streams
        this.processUrl(url, streams, method);
        
        // Aplicar filtros de bloqueio
        if (this.shouldBlockRequest(url, resourceType)) {
          req.abort();
          return;
        }
        
        req.continue();
        
      } catch (e) {
        try {
          req.continue();
        } catch (ee) {}
      }
    });
  }

  processUrl(url, streams, method) {
    // Adicionar à lista de URLs capturadas
    if (!this.capturedUrls.includes(url)) {
      const hasValidFormat = this.hasValidStreamFormat(url);
      if (hasValidFormat || url.includes('m3u8') || url.includes('stream')) {
        this.capturedUrls.push(url);
      }
    }
    
    // Processar baseado no método
    if (method === 'simple') {
      this.processSimplePatterns(url, streams);
    } else {
      this.processAdvancedPatterns(url, streams);
    }
  }

  processSimplePatterns(url, streams) {
    const patterns = this.site.simpleCapture?.patterns || [];
    
    for (const pattern of patterns) {
      const includes = pattern.includes || [];
      const type = pattern.type || 'combined';
      
      const matchesAll = includes.every(include => 
        url.toLowerCase().includes(include.toLowerCase())
      );
      
      if (matchesAll) {
        this.addStreamByType(streams, type, url);
        break;
      }
    }
  }

  processAdvancedPatterns(url, streams) {
    if (!this.hasValidStreamFormat(url)) return;
    
    const streamType = this.detectStreamType(url);
    this.addStreamByType(streams, streamType, url);
  }

  addStreamByType(streams, type, url) {
    switch (type) {
      case 'video':
        if (!streams.video) {
          streams.video = url;
          this.logger.info(`Stream de vídeo detectado: ${url.substring(0, 100)}...`);
        }
        break;
      case 'audio':
        if (!streams.audio) {
          streams.audio = url;
          this.logger.info(`Stream de áudio detectado: ${url.substring(0, 100)}...`);
        }
        break;
      case 'combined':
        if (!streams.combined.includes(url)) {
          streams.combined.push(url);
          this.logger.info(`Stream combinado detectado: ${url.substring(0, 100)}...`);
        }
        break;
    }
  }

  hasValidStreamFormat(url) {
    const formats = ['.m3u8', '.ts', '.mp4', '.mkv', '.webm', '.flv', '.mpd'];
    return formats.some(format => url.includes(format));
  }

  detectStreamType(url) {
    const urlLower = url.toLowerCase();
    const patterns = this.site.patterns || {};
    
    // Verificar padrões de vídeo
    for (const pattern of patterns.video || []) {
      if (urlLower.includes(pattern.toLowerCase())) {
        return 'video';
      }
    }
    
    // Verificar padrões de áudio
    for (const pattern of patterns.audio || []) {
      if (urlLower.includes(pattern.toLowerCase())) {
        return 'audio';
      }
    }
    
    // Verificar padrões combinados
    for (const pattern of patterns.combined || []) {
      if (urlLower.includes(pattern.toLowerCase())) {
        return 'combined';
      }
    }
    
    // Fallback para padrões universais
    if (urlLower.includes('video') || urlLower.includes('v1') || urlLower.includes('tracks-v')) {
      return 'video';
    }
    if (urlLower.includes('audio') || urlLower.includes('a1') || urlLower.includes('tracks-a')) {
      return 'audio';
    }
    
    return 'combined'; // Default
  }

  shouldBlockRequest(url, resourceType) {
    const adConfig = this.getAdProtectionConfig();
    const urlLower = url.toLowerCase();
    
    // Verificar domínios permitidos primeiro
    const isAllowed = adConfig.allowedDomains.some(domain => 
      urlLower.includes(domain.toLowerCase())
    );
    if (isAllowed) return false;
    
    // Verificar domínios bloqueados
    const isBlocked = adConfig.blockDomains.some(domain => 
      urlLower.includes(domain.toLowerCase())
    );
    if (isBlocked) return true;
    
    // Bloquear por tipo de recurso
    const blockedTypes = [];
    if (adConfig.blockImages) blockedTypes.push('image');
    if (adConfig.blockFonts) blockedTypes.push('font');
    blockedTypes.push('stylesheet'); // Sempre bloquear CSS para performance
    
    return blockedTypes.includes(resourceType);
  }

  async configurePage(page) {
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(
      this.site.userAgent || 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    await page.setDefaultTimeout(25000);
    await page.setDefaultNavigationTimeout(25000);
  }

  async capturePageContent(page) {
    try {
      this.pageContent = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          scripts: Array.from(document.querySelectorAll('script[src]'))
            .map(s => s.src).slice(0, 10),
          iframes: Array.from(document.querySelectorAll('iframe[src]'))
            .map(i => i.src).slice(0, 5),
          videos: Array.from(document.querySelectorAll('video[src]'))
            .map(v => v.src).slice(0, 5),
          players: Array.from(document.querySelectorAll('[class*="player"], [id*="player"]'))
            .map(p => ({ class: p.className, id: p.id, tag: p.tagName })).slice(0, 5)
        };
      });
    } catch (error) {
      this.pageContent = { error: error.message };
    }
  }

  async closeOverlays(page) {
    try {
      await page.evaluate(() => {
        const selectors = [
          '.modal', '.popup', '.overlay', '.advertisement',
          '[class*="modal"]', '[class*="popup"]', '[class*="overlay"]',
          '[id*="modal"]', '[id*="popup"]', '[id*="overlay"]',
          '.close', '.btn-close', '[aria-label="close"]',
          '.ad-container', '.ads', '[class*="ad-"]'
        ];
        
        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              if (el.style) el.style.display = 'none';
              if (el.remove) el.remove();
            });
          } catch (e) {}
        });
      });
    } catch (error) {
      this.logger.debug('Erro ao fechar overlays:', error);
    }
  }

  async interactWithPlayer(page) {
    try {
      await page.evaluate(() => {
        const video = document.querySelector('video, iframe[src*="player"], .video-js');
        if (video) {
          video.click();
          if (video.play && typeof video.play === 'function') {
            video.play().catch(() => {});
          }
        }
      });
    } catch (error) {
      this.logger.debug('Erro na interação básica com player');
    }
  }

  async interactWithPlayerAdvanced(page) {
    try {
      const playerFound = await page.evaluate(() => {
        const selectors = [
          'video', 'iframe[src*="player"]', 'iframe[src*="embed"]',
          '.video-js', '.jwplayer', '.flowplayer',
          '[class*="player"]:not([class*="ad"])',
          '[id*="player"]:not([id*="ad"])'
        ];
        
        let found = false;
        selectors.forEach(selector => {
          if (!found) {
            try {
              const players = document.querySelectorAll(selector);
              players.forEach(player => {
                if (player.offsetWidth > 300 && player.offsetHeight > 200) {
                  player.click();
                  if (player.play && typeof player.play === 'function') {
                    player.play().catch(() => {});
                  }
                  found = true;
                }
              });
            } catch (e) {}
          }
        });
        return found;
      });
      
      if (playerFound) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      this.logger.debug('Erro na interação avançada com player');
    }
  }

  async waitForAdditionalStreams(streams) {
    let attempts = 0;
    const maxAttempts = 15;
    
    while (attempts < maxAttempts && !this.hasValidStreams(streams)) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      if (attempts % 5 === 0) {
        this.logger.debug(`Aguardando streams... ${attempts}/${maxAttempts}s`);
      }
    }
  }

  hasValidStreams(streams) {
    return streams.video || streams.audio || streams.combined.length > 0;
  }

  getAdProtectionConfig() {
    const adProtection = this.site.adProtection || { level: 'medium' };
    const level = adProtection.level || 'medium';
    
    // Configuração base seria obtida do ConfigManager
    const baseConfig = {
      medium: {
        blockPopups: true,
        blockImages: true,
        blockFonts: false,
        blockDomains: [
          'googlesyndication.com', 'doubleclick.net', 'googletagmanager.com',
          'popads.net', 'popcash.net', 'propellerads.com'
        ],
        allowedDomains: []
      }
    };
    
    const base = baseConfig[level] || baseConfig.medium;
    
    return {
      blockPopups: adProtection.blockPopups ?? base.blockPopups,
      blockImages: adProtection.blockImages ?? base.blockImages,
      blockFonts: adProtection.blockFonts ?? base.blockFonts,
      blockDomains: [...base.blockDomains, ...(adProtection.customBlockedDomains || [])],
      allowedDomains: adProtection.allowedDomains || []
    };
  }

  async cleanup(browser) {
    if (browser) {
      try {
        const pages = await browser.pages();
        for (const page of pages) {
          try {
            await page.close();
          } catch (e) {}
        }
        await browser.close();
      } catch (e) {}
    }
  }

  // Getters para debug
  getCapturedUrls() {
    return this.capturedUrls;
  }

  getPageContent() {
    return this.pageContent;
  }
}
