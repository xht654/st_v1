// web/app.js - ATUALIZADO COM SUPORTE A HEADERS CUSTOMIZADOS E BYPASS

// ===== FUNÇÃO editSite ATUALIZADA =====
function editSite(siteId) {
    editingSiteId = siteId;
    const site = currentSites[siteId];
    
    if (!site) {
        showToast('Site não encontrado', 'error');
        return;
    }
    
    const modal = new bootstrap.Modal(document.getElementById('siteModal'));
    
    document.getElementById('siteModalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Site: ' + site.name;
    
    // Campos básicos
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
    
    // Streamlink
    document.getElementById('streamlinkQuality').value = site.streamlink?.quality || 'best';
    document.getElementById('streamlinkRetryStreams').value = site.streamlink?.retryStreams || 3;
    document.getElementById('streamlinkRetryMax').value = site.streamlink?.retryMax || 5;
    document.getElementById('streamlinkCustomArgs').value = site.streamlink?.customArgs || '';
    document.getElementById('streamlinkUseReferer').checked = site.streamlink?.useReferer !== false;
    
    // Padrões
    document.getElementById('patternsVideo').value = (site.patterns?.video || []).join(', ');
    document.getElementById('patternsAudio').value = (site.patterns?.audio || []).join(', ');
    document.getElementById('patternsCombined').value = (site.patterns?.combined || []).join(', ');
    
    // Simple capture
    if (site.simpleCapture?.patterns) {
        const patternsJson = JSON.stringify(site.simpleCapture.patterns, null, 2);
        document.getElementById('simpleCapturePatterns').value = patternsJson;
    }
    document.getElementById('simpleCaptureWaitTime').value = site.simpleCapture?.waitTime || 5000;
    
    // Ad protection
    document.getElementById('adProtectionCustomBlocked').value = (site.adProtection?.customBlockedDomains || []).join('\n');
    document.getElementById('adProtectionAllowed').value = (site.adProtection?.allowedDomains || []).join('\n');
    
    // ✅ NOVO: Headers Customizados
    if (site.customHeaders && Object.keys(site.customHeaders).length > 0) {
        const headersJson = JSON.stringify(site.customHeaders, null, 2);
        document.getElementById('customHeaders').value = headersJson;
    } else {
        document.getElementById('customHeaders').value = '{}';
    }
    
    // ✅ NOVO: Bypass de Captura
    document.getElementById('bypassCapture').checked = site.bypassCapture || false;
    document.getElementById('directStreamUrl').value = site.directStreamUrl || '';
    
    toggleCaptureMethodFields();
    toggleBypassFields();  // ✅ NOVO
    modal.show();
}

// ===== FUNÇÃO saveSite ATUALIZADA =====
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
        
        // ✅ NOVO: Headers Customizados
        try {
            const headersText = document.getElementById('customHeaders').value.trim();
            if (headersText && headersText !== '{}') {
                formData.customHeaders = JSON.parse(headersText);
            } else {
                formData.customHeaders = {};
            }
        } catch (e) {
            showToast('❌ Erro no JSON dos headers customizados: ' + e.message, 'error');
            return;
        }
        
        // ✅ NOVO: Bypass de Captura
        formData.bypassCapture = document.getElementById('bypassCapture').checked;
        if (formData.bypassCapture) {
            formData.directStreamUrl = document.getElementById('directStreamUrl').value.trim();
            
            if (!formData.directStreamUrl) {
                showToast('❌ URL direto é obrigatório quando Bypass está ativo', 'error');
                return;
            }
            
            // Validar URL direto
            try {
                new URL(formData.directStreamUrl);
            } catch (e) {
                showToast('❌ URL direto inválido', 'error');
                return;
            }
        } else {
            formData.directStreamUrl = '';
        }
        
        // Simple capture
        if (formData.captureMethod === 'simple') {
            try {
                const patternsText = document.getElementById('simpleCapturePatterns').value.trim();
                formData.simpleCapture = {
                    waitTime: parseInt(document.getElementById('simpleCaptureWaitTime').value) || 5000,
                    patterns: patternsText ? JSON.parse(patternsText) : []
                };
            } catch (e) {
                showToast('❌ Erro no JSON dos padrões de captura simples', 'error');
                return;
            }
        }
        
        // Validações básicas
        if (!formData.name || !formData.url) {
            showToast('❌ Nome e URL são obrigatórios', 'error');
            return;
        }
        
        try {
            new URL(formData.url);
        } catch (e) {
            showToast('❌ URL inválida', 'error');
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
            showToast(editingSiteId ? '✅ Site atualizado!' : '✅ Site adicionado!', 'success');
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('siteModal'));
            modal.hide();
            
            await refreshSites();
        } else {
            showToast('❌ Erro ao salvar site', 'error');
        }
        
    } catch (error) {
        showToast(`❌ Erro ao salvar site: ${error.message}`, 'error');
    }
}

// ✅ NOVO: Toggle de campos de Bypass
function toggleBypassFields() {
    const bypassEnabled = document.getElementById('bypassCapture')?.checked;
    const directUrlField = document.getElementById('directStreamUrlField');
    const captureMethodGroup = document.getElementById('captureMethodGroup');
    const advancedFields = document.getElementById('advancedCaptureFields');
    const simpleFields = document.getElementById('simpleCaptureFields');
    
    if (directUrlField) {
        directUrlField.style.display = bypassEnabled ? 'block' : 'none';
    }
    
    // Se bypass ativo, esconder campos de detecção
    if (bypassEnabled) {
        if (captureMethodGroup) captureMethodGroup.style.display = 'none';
        if (advancedFields) advancedFields.style.display = 'none';
        if (simpleFields) simpleFields.style.display = 'none';
    } else {
        if (captureMethodGroup) captureMethodGroup.style.display = 'block';
        toggleCaptureMethodFields();
    }
}

// ===== FUNÇÃO showAddSite ATUALIZADA =====
function showAddSite() {
    editingSiteId = null;
    const modal = new bootstrap.Modal(document.getElementById('siteModal'));
    
    document.getElementById('siteModalTitle').innerHTML = '<i class="fas fa-plus"></i> Adicionar Site';
    document.getElementById('siteForm').reset();
    
    // Defaults
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
    
    // ✅ NOVO: Defaults para novos campos
    document.getElementById('customHeaders').value = '{}';
    document.getElementById('bypassCapture').checked = false;
    document.getElementById('directStreamUrl').value = '';
    
    toggleCaptureMethodFields();
    toggleBypassFields();  // ✅ NOVO
    modal.show();
}

// ===== ADICIONAR EVENT LISTENER PARA BYPASS TOGGLE =====
// (Adicionar no setupEventListeners ou diretamente no HTML)
document.addEventListener('DOMContentLoaded', function() {
    const bypassCheckbox = document.getElementById('bypassCapture');
    if (bypassCheckbox) {
        bypassCheckbox.addEventListener('change', toggleBypassFields);
    }
});
