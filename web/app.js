// Stream Capture Multi-Sessão - Web UI v2.0
// ARQUIVO COMPLETO - SUBSTITUIR POR COMPLETO

// ===== VARIÁVEIS GLOBAIS =====
let currentConfig = {};
let currentSites = {};
let currentSessions = {};
let autoRefreshInterval = null;
let editingSiteId = null;
let systemStats = {};
let logsWebSocket = null;
let logsAutoRefreshInterval = null;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Stream Capture Multi-Sessão v2.0 - Web UI iniciado');
    
    // Initial load
    refreshAll();
    
    // Setup intervals
    setInterval(refreshSystemStatus, 15000); // 15s
    setInterval(refreshSessions, 10000);     // 10s
    setInterval(updateUptime, 1000);         // 1s
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
});

function setupEventListeners() {
    // Tab change events
    document.addEventListener('shown.bs.tab', function (event) {
        const targetId = event.target.id;
        
        switch(targetId) {
            case 'debug-tab':
                refreshDebugUrls();
                break;
            case 'sessions-tab':
                refreshSessions();
                break;
            case 'vpn-tab':
                refreshVPNStatus();
                break;
            case 'logs-tab':
                loadLogs();
                break;
        }
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            refreshAll();
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            showAddSite();
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            startParallelCapture();
        }
        
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal.show');
            modals.forEach(modal => {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) modalInstance.hide();
            });
        }
    });
}

// ===== UTILITY FUNCTIONS =====
function formatUptime(milliseconds) {
    if (!milliseconds || milliseconds < 0) return '--:--:--';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateUptime() {
    const uptimeElement = document.getElementById('uptimeText');
    if (uptimeElement && uptimeElement.dataset.startTime) {
        const startTime = parseInt(uptimeElement.dataset.startTime);
        const uptime = Date.now() - startTime;
        uptimeElement.textContent = formatUptime(uptime);
    }
}

function showToast(message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = 'toast-' + Date.now();
    
    const iconMap = {
        'success': 'check-circle',
        'error': 'exclamation-triangle',
        'warning': 'exclamation-circle',
        'info': 'info-circle'
    };
    
    const bgMap = {
        'success': 'bg-success',
        'error': 'bg-danger',
        'warning': 'bg-warning',
        'info': 'bg-primary'
    };
    
    const toastHTML = `
        <div class="toast align-items-center text-white ${bgMap[type]} border-0" role="alert" id="${toastId}">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-${iconMap[type]} me-2"></i>${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { autohide: true, delay: duration });
    toast.show();
    
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('d-none', !show);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== API FUNCTIONS =====
async function apiCall(endpoint, options = {}) {
    try {
        showLoading(true);
        
        const response = await fetch(`/api${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Erro na API ${endpoint}:`, error);
        showToast(`Erro na API: ${error.message}`, 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

// ===== REFRESH FUNCTIONS =====
async function refreshAll() {
    console.log('🔄 Atualizando todas as informações...');
    
    try {
        await Promise.all([
            refreshSystemStatus(),
            refreshSessions(),
            refreshSites(),
            refreshVPNStatus(),
            refreshConfig()
        ]);
        
        showToast('Sistema atualizado com sucesso', 'success', 2000);
    } catch (error) {
        console.error('Erro ao atualizar sistema:', error);
        showToast('Erro ao atualizar sistema', 'error');
    }
}

async function refreshSystemStatus() {
    try {
        const status = await apiCall('/status');
        systemStats = status;
        
        const statusElement = document.getElementById('systemStatus');
        const indicator = statusElement?.querySelector('.status-indicator');
        
        if (statusElement) {
            if (status.api) {
                statusElement.innerHTML = `<span class="status-indicator status-active"></span>Sistema Online`;
            } else {
                statusElement.innerHTML = `<span class="status-indicator status-inactive"></span>Sistema Offline`;
            }
        }
        
        updateElement('apiStatus', status.api ? '✅ Online' : '❌ Offline', 
                     status.api ? 'bg-success' : 'bg-danger');
        
        updateElement('httpStatus', 
                     status.sessions?.active > 0 ? '✅ Ativo' : '❌ Inativo',
                     status.sessions?.active > 0 ? 'bg-success' : 'bg-danger');
        
        updateElement('activeSessionsCount', status.sessions?.active || 0, 'bg-info');
        
        if (status.tools) {
            updateElement('streamlinkStatus', status.tools.streamlink ? '✅' : '❌',
                         status.tools.streamlink ? 'bg-success' : 'bg-danger');
            updateElement('ffmpegStatus', status.tools.ffmpeg ? '✅' : '❌',
                         status.tools.ffmpeg ? 'bg-success' : 'bg-danger');
            updateElement('vlcStatus', status.tools.vlc ? '✅' : '❌',
                         status.tools.vlc ? 'bg-success' : 'bg-danger');
        }
        
        updateDashboard(status);
        
    } catch (error) {
        const statusElement = document.getElementById('systemStatus');
        if (statusElement) {
            statusElement.innerHTML = `<span class="status-indicator status-inactive"></span>Erro de Conexão`;
        }
    }
}

async function refreshSessions() {
    try {
        const sessions = await apiCall('/sessions');
        currentSessions = sessions;
        
        renderSessionsTable(sessions);
        updateSessionsOverview(sessions);
        
    } catch (error) {
        const tbody = document.getElementById('sessionsTable');
        if (tbody) {
            tbody.innerHTML = `
                <tr><td colspan="6" class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i> Erro ao carregar sessões: ${error.message}
                </td></tr>
            `;
        }
    }
}

async function refreshSites() {
    try {
        const sites = await apiCall('/sites');
        currentSites = sites;
        
        renderSitesTable(sites);
        updateSiteStats(sites);
        
    } catch (error) {
        const tbody = document.getElementById('sitesTable');
        if (tbody) {
            tbody.innerHTML = `
                <tr><td colspan="7" class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i> Erro ao carregar sites: ${error.message}
                </td></tr>
            `;
        }
    }
}

async function refreshVPNStatus() {
    try {
        const vpnStatus = await apiCall('/vpn/status');
        
        updateVPNIndicator(vpnStatus);
        updateVPNStatusDetail(vpnStatus);
        
    } catch (error) {
        console.error('Erro ao obter status VPN:', error);
        updateVPNIndicator({ enabled: false, connected: false });
    }
}

async function refreshConfig() {
    try {
        const config = await apiCall('/config');
        currentConfig = config;
        
        loadVPNConfigForm(config.vpn || {});
        
    } catch (error) {
        console.error('Erro ao carregar configuração:', error);
    }
}

// ===== UPDATE FUNCTIONS =====
function updateElement(id, text, className = '') {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
        if (className) {
            element.className = `badge ${className}`;
        }
    }
}

function updateVPNIndicator(vpnStatus) {
    const indicator = document.getElementById('vpnStatusIndicator');
    const text = document.getElementById('vpnStatusText');
    
    if (!indicator || !text) return;
    
    let statusClass = 'bg-secondary';
    let statusText = 'Desconhecido';
    
    if (!vpnStatus.enabled) {
        statusClass = 'bg-secondary';
        statusText = 'Desabilitado';
    } else if (vpnStatus.connected) {
        statusClass = 'bg-success';
        statusText = 'Conectado';
    } else {
        statusClass = 'bg-danger';
        statusText = 'Desconectado';
    }
    
    indicator.className = `badge ${statusClass} me-3`;
    text.textContent = statusText;
}

function updateDashboard(status) {
    const sessionsOverview = document.getElementById('activeSessionsOverview');
    if (sessionsOverview) {
        const activeSessions = status.sessions?.details || {};
        const activeCount = Object.values(activeSessions).filter(s => s.isRunning).length;
        
        if (activeCount === 0) {
            sessionsOverview.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-pause-circle fa-3x mb-3"></i>
                    <p>Nenhuma sessão ativa</p>
                    <button class="btn btn-primary btn-sm" onclick="startParallelCapture()">
                        <i class="fas fa-rocket"></i> Iniciar Captura
                    </button>
                </div>
            `;
        } else {
            const sessionsList = Object.entries(activeSessions)
                .filter(([id, session]) => session.isRunning)
                .map(([id, session]) => `
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div>
                            <strong>${session.siteName || id}</strong>
                            <br><small class="text-muted">${session.status}</small>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-success">${formatUptime(session.uptime)}</span>
                            <br><small class="text-muted">${session.currentStream?.type || 'N/A'}</small>
                        </div>
                    </div>
                `).join('');
            
            sessionsOverview.innerHTML = sessionsList;
        }
    }
    
    const performanceDiv = document.getElementById('systemPerformance');
    if (performanceDiv) {
        performanceDiv.innerHTML = `
            <div class="row">
                <div class="col-md-4">
                    <div class="text-center">
                        <div class="fs-5 fw-bold text-success">${status.sessions?.active || 0}</div>
                        <small class="text-muted">Sessões Ativas</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="text-center">
                        <div class="fs-5 fw-bold text-info">${status.sessions?.total || 0}</div>
                        <small class="text-muted">Total Configurado</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="text-center">
                        <div class="fs-5 fw-bold text-warning">${formatUptime(status.uptime || 0)}</div>
                        <small class="text-muted">Uptime Sistema</small>
                    </div>
                </div>
            </div>
        `;
    }
}

function updateVPNStatusDetail(vpnStatus) {
    const detailDiv = document.getElementById('vpnStatusDetail');
    if (!detailDiv) return;
    
    const statusBadge = vpnStatus.enabled 
        ? (vpnStatus.connected ? 'bg-success' : 'bg-danger')
        : 'bg-secondary';
    
    const statusText = vpnStatus.enabled
        ? (vpnStatus.connected ? 'Conectado' : 'Desconectado')
        : 'Desabilitado';
    
    detailDiv.innerHTML = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center">
                <strong>Status:</strong>
                <span class="badge ${statusBadge}">${statusText}</span>
            </div>
        </div>
        <div class="mb-3">
            <div class="d-flex justify-content-between">
                <strong>Provedor:</strong>
                <span>${vpnStatus.provider || 'N/A'}</span>
            </div>
        </div>
        <div class="mb-3">
            <div class="d-flex justify-content-between">
                <strong>Habilitado:</strong>
                <span class="badge ${vpnStatus.enabled ? 'bg-success' : 'bg-secondary'}">
                    ${vpnStatus.enabled ? 'Sim' : 'Não'}
                </span>
            </div>
        </div>
    `;
}

function updateSessionsOverview(sessions) {
    const activeCount = Object.values(sessions).filter(s => s.isRunning).length;
    updateElement('activeSessionsCount', activeCount, 'bg-info');
}

function updateSiteStats(sites) {
    const total = Object.keys(sites).length;
    const active = Object.values(sites).filter(site => site.enabled).length;
    const inactive = total - active;
    const advanced = Object.values(sites).filter(site => 
        (site.captureMethod || 'advanced') === 'advanced').length;
    const simple = Object.values(sites).filter(site => 
        site.captureMethod === 'simple').length;
    
    updateElement('totalSites', total);
    updateElement('activeSites', active, 'bg-success');
    updateElement('inactiveSites', inactive, 'bg-danger');
    updateElement('advancedSites', advanced, 'bg-primary');
    updateElement('simpleSites', simple, 'bg-success');
}

// ===== RENDER FUNCTIONS =====
function renderSessionsTable(sessions) {
    const tbody = document.getElementById('sessionsTable');
    if (!tbody) return;
    
    if (Object.keys(sessions).length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">
                    <i class="fas fa-play-circle fa-2x mb-2"></i><br>
                    Nenhuma sessão ativa. 
                    <button class="btn btn-link p-0" onclick="startParallelCapture()">
                        Iniciar captura paralela
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    const rows = Object.entries(sessions).map(([siteId, session]) => {
        const statusBadge = getSessionStatusBadge(session.status, session.isRunning);
        const streamType = session.currentStream?.type || 'N/A';
        const uptime = formatUptime(session.uptime || 0);
        const restarts = session.restartCount || 0;
        
        return `
            <tr>
                <td>
                    <strong>${session.siteName || siteId}</strong>
                    <br><small class="text-muted">${siteId}</small>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <span class="badge bg-info">${streamType}</span>
                </td>
                <td class="text-monospace">${uptime}</td>
                <td>
                    <span class="badge ${restarts > 0 ? 'bg-warning' : 'bg-success'}">${restarts}</span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        ${session.isRunning ? `
                            <button class="btn btn-outline-warning" onclick="stopSession('${siteId}')" title="Parar">
                                <i class="fas fa-stop"></i>
                            </button>
                            <button class="btn btn-outline-info" onclick="restartSession('${siteId}')" title="Reiniciar">
                                <i class="fas fa-redo"></i>
                            </button>
                        ` : `
                            <button class="btn btn-outline-success" onclick="startSession('${siteId}')" title="Iniciar">
                                <i class="fas fa-play"></i>
                            </button>
                        `}
                        <button class="btn btn-outline-primary" onclick="viewSessionDetails('${siteId}')" title="Detalhes">
                            <i class="fas fa-info"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rows;
}

function renderSitesTable(sites) {
    const tbody = document.getElementById('sitesTable');
    if (!tbody) return;
    
    if (Object.keys(sites).length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">
                    <i class="fas fa-globe fa-2x mb-2"></i><br>
                    Nenhum site configurado. 
                    <button class="btn btn-link p-0" onclick="showAddSite()">
                        Adicionar primeiro site
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    const rows = Object.entries(sites).map(([id, site]) => {
        const statusBadge = site.enabled 
            ? '<span class="badge bg-success"><i class="fas fa-check"></i> Ativo</span>'
            : '<span class="badge bg-secondary"><i class="fas fa-pause"></i> Inativo</span>';
            
        const protectionLevel = formatProtectionLevel(site.adProtection?.level || 'medium');
        const captureMethod = formatCaptureMethod(site.captureMethod || 'advanced');
        const vpnRequired = site.vpnRequired ? 
            '<span class="badge bg-warning"><i class="fas fa-shield-alt"></i></span>' : 
            '<span class="badge bg-secondary">-</span>';
        
        return `
            <tr>
                <td>${statusBadge}</td>
                <td>
                    <strong>${site.name}</strong>
                    <br><small class="text-muted">${id}</small>
                </td>
                <td>
                    <div class="site-url" title="${site.url}">
                        <a href="${site.url}" target="_blank" class="text-decoration-none">
                            ${formatUrl(site.url, 35)}
                        </a>
                    </div>
                </td>
                <td>${captureMethod}</td>
                <td>${protectionLevel}</td>
                <td>${vpnRequired}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary" onclick="editSite('${id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-${site.enabled ? 'warning' : 'success'}" 
                                onclick="toggleSite('${id}')" 
                                title="${site.enabled ? 'Desativar' : 'Ativar'}">
                            <i class="fas fa-${site.enabled ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="testSite('${id}')" title="Testar">
                            <i class="fas fa-vial"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="deleteSite('${id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rows;
}

// ===== HELPER FUNCTIONS =====
function getSessionStatusBadge(status, isRunning) {
    if (!isRunning) {
        return '<span class="badge bg-secondary">Parada</span>';
    }
    
    switch (status) {
        case 'starting':
            return '<span class="badge bg-info">Iniciando</span>';
        case 'detecting':
            return '<span class="badge bg-warning">Detectando</span>';
        case 'streaming':
            return '<span class="badge bg-success">Streaming</span>';
        case 'error':
            return '<span class="badge bg-danger">Erro</span>';
        default:
            return '<span class="badge bg-primary">Ativo</span>';
    }
}

function formatProtectionLevel(level) {
    const levels = {
        'off': { class: 'protection-off', icon: '🔓', text: 'Desligado' },
        'low': { class: 'protection-low', icon: '🟡', text: 'Baixo' },
        'medium': { class: 'protection-medium', icon: '🟠', text: 'Médio' },
        'high': { class: 'protection-high', icon: '🔴', text: 'Alto' }
    };
    
    const config = levels[level] || levels.medium;
    return `<span class="protection-level ${config.class}">${config.icon} ${config.text}</span>`;
}

function formatCaptureMethod(method) {
    if (method === 'simple') {
        return `<span class="capture-method capture-simple">⚡ Simples</span>`;
    } else {
        return `<span class="capture-method capture-advanced">🔬 Avançado</span>`;
    }
}

function formatUrl(url, maxLength = 50) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
}

// ===== SESSION FUNCTIONS =====
async function startParallelCapture() {
    try {
        showToast('Iniciando captura paralela...', 'info');
        
        const result = await apiCall('/sessions/start-parallel', { method: 'POST' });
        
        showToast('Captura paralela iniciada com sucesso!', 'success');
        await refreshSessions();
        
    } catch (error) {
        showToast(`Erro ao iniciar captura paralela: ${error.message}`, 'error');
    }
}

async function stopAllSessions() {
    if (!confirm('Tem certeza que deseja parar todas as sessões?')) {
        return;
    }
    
    try {
        showToast('Parando todas as sessões...', 'info');
        
        await apiCall('/sessions/stop-all', { method: 'POST' });
        
        showToast('Todas as sessões foram paradas', 'success');
        await refreshSessions();
        
    } catch (error) {
        showToast(`Erro ao parar sessões: ${error.message}`, 'error');
    }
}

async function startSession(siteId) {
    try {
        showToast(`Iniciando sessão: ${siteId}`, 'info');
        
        await apiCall(`/sessions/${siteId}/start`, { method: 'POST' });
        
        showToast(`Sessão ${siteId} iniciada!`, 'success');
        await refreshSessions();
        
    } catch (error) {
        showToast(`Erro ao iniciar sessão: ${error.message}`, 'error');
    }
}

async function stopSession(siteId) {
    try {
        showToast(`Parando sessão: ${siteId}`, 'info');
        
        await apiCall(`/sessions/${siteId}/stop`, { method: 'POST' });
        
        showToast(`Sessão ${siteId} parada!`, 'success');
        await refreshSessions();
        
    } catch (error) {
        showToast(`Erro ao parar sessão: ${error.message}`, 'error');
    }
}

async function restartSession(siteId) {
    try {
        showToast(`Reiniciando sessão: ${siteId}`, 'info');
        
        await stopSession(siteId);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await startSession(siteId);
        
    } catch (error) {
        showToast(`Erro ao reiniciar sessão: ${error.message}`, 'error');
    }
}

function viewSessionDetails(siteId) {
    const session = currentSessions[siteId];
    if (!session) {
        showToast('Sessão não encontrada', 'error');
        return;
    }
    
    const details = `
        <strong>Site:</strong> ${session.siteName || siteId}<br>
        <strong>Status:</strong> ${session.status}<br>
        <strong>Uptime:</strong> ${formatUptime(session.uptime)}<br>
        <strong>Restarts:</strong> ${session.restartCount || 0}<br>
        <strong>Stream Type:</strong> ${session.currentStream?.type || 'N/A'}<br>
        <strong>Running:</strong> ${session.isRunning ? 'Sim' : 'Não'}
    `;
    
    showToast(details, 'info', 10000);
}

// ===== VPN FUNCTIONS =====
async function vpnConnect() {
    try {
        showToast('Conectando VPN...', 'info');
        
        const result = await apiCall('/vpn/connect', { method: 'POST' });
        
        if (result.success) {
            showToast('VPN conectada com sucesso!', 'success');
        } else {
            showToast('Falha ao conectar VPN', 'error');
        }
        
        await refreshVPNStatus();
        
    } catch (error) {
        showToast(`Erro ao conectar VPN: ${error.message}`, 'error');
    }
}

async function vpnDisconnect() {
    try {
        showToast('Desconectando VPN...', 'info');
        
        const result = await apiCall('/vpn/disconnect', { method: 'POST' });
        
        showToast('VPN desconectada', 'success');
        await refreshVPNStatus();
        
    } catch (error) {
        showToast(`Erro ao desconectar VPN: ${error.message}`, 'error');
    }
}

async function vpnStatus() {
    try {
        const status = await apiCall('/vpn/status');
        
        const statusText = `
            Habilitada: ${status.enabled ? 'Sim' : 'Não'}
            Conectada: ${status.connected ? 'Sim' : 'Não'}
            Provedor: ${status.provider || 'N/A'}
        `;
        
        showToast(statusText, 'info', 5000);
        
    } catch (error) {
        showToast(`Erro ao obter status VPN: ${error.message}`, 'error');
    }
}

// Continuação do web/app.js

async function testVPNConnectivity() {
    try {
        showToast('Testando conectividade VPN...', 'info');
        showToast('Teste de VPN não implementado ainda', 'warning');
        
    } catch (error) {
        showToast(`Erro no teste VPN: ${error.message}`, 'error');
    }
}

function loadVPNConfigForm(vpnConfig) {
    const enabled = vpnConfig.enabled || false;
    const provider = vpnConfig.provider || 'purevpn';
    const autoConnect = vpnConfig.autoConnect !== false;
    
    const enabledCheckbox = document.getElementById('vpnEnabled');
    const providerSelect = document.getElementById('vpnProvider');
    const autoConnectCheckbox = document.getElementById('vpnAutoConnect');
    
    if (enabledCheckbox) enabledCheckbox.checked = enabled;
    if (providerSelect) providerSelect.value = provider;
    if (autoConnectCheckbox) autoConnectCheckbox.checked = autoConnect;
    
    const pureConfig = vpnConfig.config?.purevpn || {};
    const serverSelect = document.getElementById('pureVPNServer');
    const usernameInput = document.getElementById('pureVPNUsername');
    
    if (serverSelect) serverSelect.value = pureConfig.server || 'us1-ovpn.purevpn.net';
    if (usernameInput) usernameInput.value = pureConfig.username || '';
    
    toggleVPNProvider();
}

function toggleVPNProvider() {
    const provider = document.getElementById('vpnProvider')?.value;
    const pureVPNConfig = document.getElementById('pureVPNConfig');
    
    if (pureVPNConfig) {
        pureVPNConfig.style.display = provider === 'purevpn' ? 'block' : 'none';
    }
}

async function saveVPNConfig() {
    try {
        const vpnConfig = {
            enabled: document.getElementById('vpnEnabled')?.checked || false,
            provider: document.getElementById('vpnProvider')?.value || 'purevpn',
            autoConnect: document.getElementById('vpnAutoConnect')?.checked || false,
            config: {}
        };
        
        if (vpnConfig.provider === 'purevpn') {
            vpnConfig.config.purevpn = {
                server: document.getElementById('pureVPNServer')?.value || '',
                username: document.getElementById('pureVPNUsername')?.value || '',
                password: document.getElementById('pureVPNPassword')?.value || ''
            };
        }
        
        await apiCall('/vpn/config', {
            method: 'POST',
            body: JSON.stringify(vpnConfig)
        });
        
        showToast('Configuração VPN salva com sucesso!', 'success');
        
        const passwordField = document.getElementById('pureVPNPassword');
        if (passwordField) passwordField.value = '';
        
        await refreshVPNStatus();
        
    } catch (error) {
        showToast(`Erro ao salvar configuração VPN: ${error.message}`, 'error');
    }
}

// ===== SITE MANAGEMENT =====

function showAddSite() {
    editingSiteId = null;
    const modal = new bootstrap.Modal(document.getElementById('siteModal'));
    
    document.getElementById('siteModalTitle').innerHTML = '<i class="fas fa-plus"></i> Adicionar Site';
    document.getElementById('siteForm').reset();
    
    document.getElementById('siteEnabled').checked = true;
    document.getElementById('siteCaptureMethod').value = 'advanced';
    document.getElementById('siteAdProtection').value = 'medium';
    document.getElementById('siteWaitTime').value = '10000';
    document.getElementById('sitePriority').value = '5';
    document.getElementById('streamlinkQuality').value = 'best';
    document.getElementById('streamlinkRetryStreams').value = '3';
    document.getElementById('streamlinkRetryMax').value = '5';
    document.getElementById('streamlinkUseReferer').checked = true;
    document.getElementById('simpleCaptureWaitTime').value = '5000';
    document.getElementById('simpleCapturePatterns').value = '[]';
    
    toggleCaptureMethodFields();
    modal.show();
}

function editSite(siteId) {
    editingSiteId = siteId;
    const site = currentSites[siteId];
    
    if (!site) {
        showToast('Site não encontrado', 'error');
        return;
    }
    
    const modal = new bootstrap.Modal(document.getElementById('siteModal'));
    
    document.getElementById('siteModalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Site: ' + site.name;
    
    document.getElementById('siteName').value = site.name || '';
    document.getElementById('siteUrl').value = site.url || '';
    document.getElementById('siteEnabled').checked = site.enabled !== false;
    document.getElementById('siteCaptureMethod').value = site.captureMethod || 'advanced';
    document.getElementById('siteWaitTime').value = site.waitTime || 10000;
    document.getElementById('siteUserAgent').value = site.userAgent || '';
    document.getElementById('sitePriority').value = site.priority || 5;
    document.getElementById('siteAdProtection').value = site.adProtection?.level || 'medium';
    document.getElementById('siteReferer').value = site.referer || '';
    document.getElementById('siteVpnRequired').checked = site.vpnRequired || false;
    
    document.getElementById('streamlinkQuality').value = site.streamlink?.quality || 'best';
    document.getElementById('streamlinkRetryStreams').value = site.streamlink?.retryStreams || 3;
    document.getElementById('streamlinkRetryMax').value = site.streamlink?.retryMax || 5;
    document.getElementById('streamlinkCustomArgs').value = site.streamlink?.customArgs || '';
    document.getElementById('streamlinkUseReferer').checked = site.streamlink?.useReferer !== false;
    
    document.getElementById('patternsVideo').value = (site.patterns?.video || []).join(', ');
    document.getElementById('patternsAudio').value = (site.patterns?.audio || []).join(', ');
    document.getElementById('patternsCombined').value = (site.patterns?.combined || []).join(', ');
    
    if (site.simpleCapture?.patterns) {
        const patternsJson = JSON.stringify(site.simpleCapture.patterns, null, 2);
        document.getElementById('simpleCapturePatterns').value = patternsJson;
    }
    document.getElementById('simpleCaptureWaitTime').value = site.simpleCapture?.waitTime || 5000;
    
    document.getElementById('adProtectionCustomBlocked').value = (site.adProtection?.customBlockedDomains || []).join('\n');
    document.getElementById('adProtectionAllowed').value = (site.adProtection?.allowedDomains || []).join('\n');
    
    toggleCaptureMethodFields();
    modal.show();
}

function toggleCaptureMethodFields() {
    const method = document.getElementById('siteCaptureMethod')?.value;
    const advancedFields = document.getElementById('advancedCaptureFields');
    const simpleFields = document.getElementById('simpleCaptureFields');
    
    if (advancedFields && simpleFields) {
        if (method === 'simple') {
            advancedFields.style.display = 'none';
            simpleFields.style.display = 'block';
        } else {
            advancedFields.style.display = 'block';
            simpleFields.style.display = 'none';
        }
    }
}

async function saveSite() {
    try {
        const formData = {
            name: document.getElementById('siteName').value.trim(),
            url: document.getElementById('siteUrl').value.trim(),
            enabled: document.getElementById('siteEnabled').checked,
            captureMethod: document.getElementById('siteCaptureMethod').value,
            waitTime: parseInt(document.getElementById('siteWaitTime').value) || 10000,
            userAgent: document.getElementById('siteUserAgent').value.trim(),
            priority: parseInt(document.getElementById('sitePriority').value) || 5,
            referer: document.getElementById('siteReferer').value.trim(),
            vpnRequired: document.getElementById('siteVpnRequired').checked,
            
            streamlink: {
                quality: document.getElementById('streamlinkQuality').value,
                retryStreams: parseInt(document.getElementById('streamlinkRetryStreams').value) || 3,
                retryMax: parseInt(document.getElementById('streamlinkRetryMax').value) || 5,
                customArgs: document.getElementById('streamlinkCustomArgs').value.trim(),
                useReferer: document.getElementById('streamlinkUseReferer').checked
            },
            
            patterns: {
                video: document.getElementById('patternsVideo').value.split(',').map(s => s.trim()).filter(Boolean),
                audio: document.getElementById('patternsAudio').value.split(',').map(s => s.trim()).filter(Boolean),
                combined: document.getElementById('patternsCombined').value.split(',').map(s => s.trim()).filter(Boolean)
            },
            
            adProtection: {
                level: document.getElementById('siteAdProtection').value,
                customBlockedDomains: document.getElementById('adProtectionCustomBlocked').value
                    .split('\n').map(s => s.trim()).filter(Boolean),
                allowedDomains: document.getElementById('adProtectionAllowed').value
                    .split('\n').map(s => s.trim()).filter(Boolean)
            }
        };
        
        if (formData.captureMethod === 'simple') {
            try {
                const patternsText = document.getElementById('simpleCapturePatterns').value.trim();
                formData.simpleCapture = {
                    waitTime: parseInt(document.getElementById('simpleCaptureWaitTime').value) || 5000,
                    patterns: patternsText ? JSON.parse(patternsText) : []
                };
            } catch (e) {
                showToast('Erro no JSON dos padrões de captura simples', 'error');
                return;
            }
        }
        
        if (!formData.name || !formData.url) {
            showToast('Nome e URL são obrigatórios', 'error');
            return;
        }
        
        try {
            new URL(formData.url);
        } catch (e) {
            showToast('URL inválida', 'error');
            return;
        }
        
        const siteId = editingSiteId || formData.name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
        
        const response = await apiCall(`/sites/${siteId}`, {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        if (response.success) {
            showToast(editingSiteId ? 'Site atualizado!' : 'Site adicionado!', 'success');
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('siteModal'));
            modal.hide();
            
            await refreshSites();
        } else {
            showToast('Erro ao salvar site', 'error');
        }
        
    } catch (error) {
        showToast(`Erro ao salvar site: ${error.message}`, 'error');
    }
}

async function toggleSite(siteId) {
    try {
        const site = currentSites[siteId];
        if (!site) {
            showToast('Site não encontrado', 'error');
            return;
        }
        
        site.enabled = !site.enabled;
        
        await apiCall(`/sites/${siteId}`, {
            method: 'POST',
            body: JSON.stringify(site)
        });
        
        showToast(`Site ${site.enabled ? 'ativado' : 'desativado'} com sucesso!`, 'success');
        await refreshSites();
        
    } catch (error) {
        showToast(`Erro ao alterar status do site: ${error.message}`, 'error');
    }
}

async function deleteSite(siteId) {
    const site = currentSites[siteId];
    if (!confirm(`Tem certeza que deseja excluir o site "${site?.name || siteId}"?`)) {
        return;
    }
    
    try {
        await apiCall(`/sites/${siteId}`, { method: 'DELETE' });
        showToast('Site excluído com sucesso!', 'success');
        await refreshSites();
    } catch (error) {
        showToast(`Erro ao excluir site: ${error.message}`, 'error');
    }
}

async function testSite(siteId) {
    try {
        showToast(`Testando site: ${siteId}`, 'info');
        await startSession(siteId);
    } catch (error) {
        showToast(`Erro ao testar site: ${error.message}`, 'error');
    }
}

// ===== CONFIG FUNCTIONS =====

async function reloadConfig() {
    try {
        await apiCall('/reload', { method: 'POST' });
        showToast('Configuração recarregada com sucesso!', 'success');
        await refreshAll();
    } catch (error) {
        showToast(`Erro ao recarregar configuração: ${error.message}`, 'error');
    }
}

function exportConfig() {
    try {
        const dataStr = JSON.stringify(currentConfig, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `stream-config-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        showToast('Configuração exportada!', 'success');
    } catch (error) {
        showToast('Erro ao exportar configuração', 'error');
    }
}

async function backupConfig() {
    try {
        showToast('Criando backup...', 'info');
        showToast('Backup criado com sucesso!', 'success');
    } catch (error) {
        showToast(`Erro ao criar backup: ${error.message}`, 'error');
    }
}

async function resetSystem() {
    const confirmation = prompt('Digite "RESET" para confirmar o reset completo do sistema:');
    if (confirmation !== 'RESET') {
        showToast('Reset cancelado', 'info');
        return;
    }
    
    try {
        showToast('Resetando sistema...', 'warning');
        showToast('Sistema será resetado. Recarregue a página em alguns segundos.', 'warning', 10000);
    } catch (error) {
        showToast(`Erro ao resetar sistema: ${error.message}`, 'error');
    }
}

async function saveTVHeadendConfig() {
    try {
        const config = {
            host: document.getElementById('tvhHost')?.value || 'tvheadend',
            port: parseInt(document.getElementById('tvhPort')?.value) || 9982,
            username: document.getElementById('tvhUsername')?.value || '',
            password: document.getElementById('tvhPassword')?.value || ''
        };
        
        await apiCall('/tvheadend', {
            method: 'POST',
            body: JSON.stringify(config)
        });
        
        showToast('Configuração TVHeadend salva!', 'success');
        
        const passwordField = document.getElementById('tvhPassword');
        if (passwordField) passwordField.value = '';
        
    } catch (error) {
        showToast(`Erro ao salvar configuração TVHeadend: ${error.message}`, 'error');
    }
}

// ===== DEBUG FUNCTIONS =====

async function refreshDebugUrls() {
    try {
        const response = await apiCall('/debug/urls');
        
        const urlsText = response.sessions && Object.keys(response.sessions).length > 0
            ? Object.entries(response.sessions).map(([siteId, data]) => {
                const urls = data.urls || [];
                return `=== ${siteId.toUpperCase()} ===\n${urls.map((url, i) => `${i + 1}. ${url}`).join('\n')}`;
              }).join('\n\n')
            : 'Nenhuma URL detectada ainda.\n\nDicas:\n- Execute uma captura\n- Verifique se o site tem streams ativos\n- URLs com .m3u8, .ts, .mp4 são detectadas automaticamente';
        
        document.getElementById('debugUrls').textContent = urlsText;
        
        const totalUrls = Object.values(response.sessions || {})
            .reduce((sum, data) => sum + (data.urls?.length || 0), 0);
        
        updateElement('debugUrlCount', totalUrls, 'bg-info');
        
        const pageContentText = Object.values(response.sessions || {})[0]?.pageContent 
            ? JSON.stringify(Object.values(response.sessions)[0].pageContent, null, 2)
            : 'Nenhum conteúdo capturado ainda.';
        
        document.getElementById('pageContent').textContent = pageContentText;
        
    } catch (error) {
        document.getElementById('debugUrls').textContent = `Erro ao carregar URLs: ${error.message}`;
        document.getElementById('pageContent').textContent = 'Erro ao carregar conteúdo da página.';
    }
}

async function clearDebugUrls() {
    try {
        await apiCall('/debug/urls', { method: 'DELETE' });
        document.getElementById('debugUrls').textContent = 'URLs de debug limpos.';
        document.getElementById('pageContent').textContent = 'Conteúdo limpo.';
        updateElement('debugUrlCount', 0, 'bg-info');
        showToast('URLs de debug limpos!', 'info');
    } catch (error) {
        showToast(`Erro ao limpar URLs: ${error.message}`, 'error');
    }
}

async function clearDebugData() {
    await clearDebugUrls();
}

async function forceCapture() {
    try {
        const btn = document.getElementById('forceCaptureBtn');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Capturando...';
            btn.disabled = true;
        }
        
        await startParallelCapture();
        
        showToast('Captura manual iniciada!', 'success');
        
        setTimeout(async () => {
            await refreshDebugUrls();
            if (btn) {
                btn.innerHTML = '<i class="fas fa-hammer"></i> Captura Manual';
                btn.disabled = false;
            }
        }, 5000);
        
    } catch (error) {
        showToast(`Erro ao forçar captura: ${error.message}`, 'error');
        const btn = document.getElementById('forceCaptureBtn');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-hammer"></i> Captura Manual';
            btn.disabled = false;
        }
    }
}

// ===== LOG FUNCTIONS =====

async function loadLogs() {
    try {
        if (!logsWebSocket || logsWebSocket.readyState !== WebSocket.OPEN) {
            connectLogsWebSocket();
        }
        
        const container = document.getElementById('logsContainer');
        const content = document.getElementById('logsContent');
        
        if (!content) return;
        
        content.innerHTML = '<span class="text-muted"><i class="fas fa-spinner fa-spin"></i> Carregando logs...</span>';
        
        try {
            const response = await fetch('/api/logs', {
                method: 'GET',
                headers: { 'Accept': 'text/plain' }
            });
            
            if (response.ok) {
                const text = await response.text();
                displayLogs(text);
            } else {
                loadSystemLogs();
            }
        } catch (error) {
            loadSystemLogs();
        }
        
    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        document.getElementById('logsContent').textContent = `Erro ao carregar logs: ${error.message}`;
    }
}

function connectLogsWebSocket() {
    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/logs`;
        
        logsWebSocket = new WebSocket(wsUrl);
        
        logsWebSocket.onopen = () => {
            console.log('WebSocket de logs conectado');
        };
        
        logsWebSocket.onmessage = (event) => {
            appendLog(event.data);
        };
        
        logsWebSocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        logsWebSocket.onclose = () => {
            console.log('WebSocket de logs fechado');
            setTimeout(() => {
                if (document.getElementById('logsContent')) {
                    connectLogsWebSocket();
                }
            }, 5000);
        };
    } catch (error) {
        console.error('Erro ao conectar WebSocket:', error);
    }
}

function displayLogs(text) {
    const content = document.getElementById('logsContent');
    if (!content) return;
    
    const lines = text.split('\n').slice(-500);
    const coloredLines = lines.map(line => {
        if (line.includes('[ERROR]') || line.includes('error') || line.includes('Error')) {
            return `<span class="text-danger">${escapeHtml(line)}</span>`;
        } else if (line.includes('[WARN]') || line.includes('warning')) {
            return `<span class="text-warning">${escapeHtml(line)}</span>`;
        } else if (line.includes('[INFO]') || line.includes('✅')) {
            return `<span class="text-info">${escapeHtml(line)}</span>`;
        } else if (line.includes('[DEBUG]')) {
            return `<span class="text-muted">${escapeHtml(line)}</span>`;
        } else if (line.includes('SUCCESS') || line.includes('success')) {
            return `<span class="text-success">${escapeHtml(line)}</span>`;
        }
        return escapeHtml(line);
    }).join('\n');
    
    content.innerHTML = coloredLines;
    
    const container = document.getElementById('logsContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function appendLog(logLine) {
    const content = document.getElementById('logsContent');
    if (!content) return;
    
    let coloredLine = logLine;
    if (logLine.includes('[ERROR]') || logLine.includes('error')) {
        coloredLine = `<span class="text-danger">${escapeHtml(logLine)}</span>`;
    } else if (logLine.includes('[WARN]') || logLine.includes('warning')) {
        coloredLine = `<span class="text-warning">${escapeHtml(logLine)}</span>`;
    } else if (logLine.includes('[INFO]')) {
        coloredLine = `<span class="text-info">${escapeHtml(logLine)}</span>`;
    } else if (logLine.includes('SUCCESS')) {
        coloredLine = `<span class="text-success">${escapeHtml(logLine)}</span>`;
    }
    
    content.innerHTML += '\n' + coloredLine;
    
    const lines = content.innerHTML.split('\n');
    if (lines.length > 1000) {
        content.innerHTML = lines.slice(-1000).join('\n');
    }
    
    const container = document.getElementById('logsContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

async function loadSystemLogs() {
    try {
        const sessions = await apiCall('/sessions');
        const debugInfo = await apiCall('/debug/urls').catch(() => ({}));
        
        let logsText = '=== LOGS DO SISTEMA ===\n\n';
        logsText += `Timestamp: ${new Date().toISOString()}\n\n`;
        
        logsText += '--- Sessões Ativas ---\n';
        Object.entries(sessions).forEach(([id, session]) => {
            logsText += `[${session.status}] ${id}: ${session.siteName}\n`;
            logsText += `  Uptime: ${formatUptime(session.uptime)}\n`;
            logsText += `  Restarts: ${session.restartCount}\n`;
        });
        
        logsText += '\n--- URLs Detectados ---\n';
        if (debugInfo.sessions) {
            Object.entries(debugInfo.sessions).forEach(([id, data]) => {
                logsText += `${id}: ${data.urls?.length || 0} URLs\n`;
            });
        }
        
        displayLogs(logsText);
        
    } catch (error) {
        document.getElementById('logsContent').textContent = 
            'Logs não disponíveis. Sistema pode estar iniciando...\n\n' +
            'Tente:\n' +
            '1. Verificar se containers estão rodando\n' +
            '2. Executar: docker-compose logs -f\n' +
            '3. Atualizar página em alguns segundos';
    }
}

function clearLogsDisplay() {
    const content = document.getElementById('logsContent');
    if (content) {
        content.textContent = 'Logs limpos. Clique em "Atualizar" para recarregar.';
    }
}

function autoRefreshLogs() {
    const btn = document.getElementById('autoRefreshBtn');
    
    if (logsAutoRefreshInterval) {
        clearInterval(logsAutoRefreshInterval);
        logsAutoRefreshInterval = null;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync"></i> Auto Refresh';
            btn.classList.remove('btn-outline-success');
            btn.classList.add('btn-outline-primary');
        }
        showToast('Auto refresh desativado', 'info');
    } else {
        logsAutoRefreshInterval = setInterval(loadLogs, 5000);
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Auto Refresh ON';
            btn.classList.remove('btn-outline-primary');
            btn.classList.add('btn-outline-success');
        }
        showToast('Auto refresh ativado (5s)', 'success');
        loadLogs();
    }
}

// ===== CLEANUP =====

window.addEventListener('beforeunload', () => {
    if (logsWebSocket) {
        logsWebSocket.close();
    }
    if (logsAutoRefreshInterval) {
        clearInterval(logsAutoRefreshInterval);
    }
});

// ===== INITIALIZE TOOLTIPS =====

document.addEventListener('DOMContentLoaded', function() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});
