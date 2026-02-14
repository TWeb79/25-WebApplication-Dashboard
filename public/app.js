// Local WebApp Monitor - Frontend Application

class WebAppMonitor {
    constructor() {
        this.apps = [];
        this.currentView = 'dashboard';
        this.filter = {
            search: '',
            category: 'all',
            status: 'all'
        };
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.connectWebSocket();
        await this.loadApps();
        await this.checkOllamaStatus();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view);
            });
        });

        // Scan buttons
        document.getElementById('quick-scan-btn').addEventListener('click', () => this.startQuickScan());
        document.getElementById('full-scan-btn').addEventListener('click', () => this.startFullScan());
        document.getElementById('health-check-btn').addEventListener('click', () => this.runHealthCheck());
        document.getElementById('empty-scan-btn').addEventListener('click', () => this.startQuickScan());

        // Filters
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filter.search = e.target.value.toLowerCase();
            this.renderApps();
        });

        document.getElementById('category-filter').addEventListener('change', (e) => {
            this.filter.category = e.target.value;
            this.renderApps();
        });

        // Modals
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal('app-modal'));
        document.getElementById('add-app-modal-close').addEventListener('click', () => this.closeModal('add-app-modal'));
        
        document.getElementById('add-app-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addApp();
        });

        // Close modal on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = () => {
            console.log('[WebSocket] Connected');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        ws.onclose = () => {
            console.log('[WebSocket] Disconnected, reconnecting...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        ws.onerror = (error) => {
            console.error('[WebSocket] Error:', error);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'scan_start':
                this.showLoading(data.mode === 'quick' ? 'Running quick scan...' : 'Running full scan...');
                break;

            case 'app_discovered':
                this.showToast('info', `Discovered: ${data.app.name}`);
                this.loadApps();
                break;

            case 'scan_complete':
                this.hideLoading();
                this.showToast('success', `Scan complete! Found ${data.found} applications.`);
                this.loadApps();
                break;

            case 'scan_error':
                this.hideLoading();
                this.showToast('error', `Scan error: ${data.error}`);
                break;

            case 'health_check_start':
                this.showLoading('Running health checks...');
                break;

            case 'health_check_complete':
                this.hideLoading();
                this.showToast('success', `Health check complete: ${data.online} online, ${data.offline} offline`);
                this.loadApps();
                break;

            case 'health_update':
                this.updateAppStatus(data);
                break;

            case 'periodic_health_check':
                this.loadApps();
                break;

            case 'screenshot_update_start':
                this.showLoading('Updating screenshots...');
                break;

            case 'screenshot_updated':
                if (data.success) {
                    const appCard = document.querySelector(`[data-app-id="${data.appId}"]`);
                    if (appCard) {
                        this.loadApps();
                    }
                }
                break;

            case 'screenshot_update_complete':
                this.hideLoading();
                this.showToast('success', 'Screenshots updated');
                break;

            case 'app_added':
                this.showToast('success', `Added: ${data.app.name}`);
                this.loadApps();
                break;

            case 'app_updated':
            case 'app_removed':
                this.loadApps();
                break;
        }
    }

    async loadApps() {
        try {
            const response = await fetch('/api/apps');
            const data = await response.json();
            this.apps = data.apps;
            this.updateStats(data.stats);
            this.renderApps();
        } catch (error) {
            console.error('Failed to load apps:', error);
            this.showToast('error', 'Failed to load applications');
        }
    }

    updateStats(stats) {
        document.getElementById('total-apps').textContent = stats.totalApps || 0;
        document.getElementById('stat-online').textContent = stats.onlineApps || 0;
        document.getElementById('stat-offline').textContent = stats.offlineApps || 0;
        document.getElementById('online-count').textContent = stats.onlineApps || 0;
        document.getElementById('offline-count').textContent = stats.offlineApps || 0;
        
        if (stats.lastScan) {
            const lastScanDate = new Date(stats.lastScan);
            document.getElementById('last-scan').textContent = this.formatTimeAgo(lastScanDate);
        } else {
            document.getElementById('last-scan').textContent = 'Never';
        }
    }

    renderApps() {
        const grid = document.getElementById('apps-grid');
        const emptyState = document.getElementById('empty-state');
        
        // Filter apps
        const filteredApps = this.apps.filter(app => {
            const matchesSearch = this.filter.search === '' || 
                app.name.toLowerCase().includes(this.filter.search) ||
                app.url.toLowerCase().includes(this.filter.search);
            
            const matchesCategory = this.filter.category === 'all' || 
                app.category === this.filter.category;
            
            let matchesStatus = true;
            if (this.currentView === 'online') matchesStatus = app.isOnline;
            if (this.currentView === 'offline') matchesStatus = !app.isOnline;
            
            return matchesSearch && matchesCategory && matchesStatus;
        });

        if (filteredApps.length === 0) {
            grid.innerHTML = '';
            emptyState.classList.add('active');
            return;
        }

        emptyState.classList.remove('active');
        
        grid.innerHTML = filteredApps.map(app => this.createAppCard(app)).join('');
        
        // Add click listeners to cards
        grid.querySelectorAll('.app-card').forEach(card => {
            card.addEventListener('click', () => {
                const appId = card.dataset.appId;
                this.showAppDetails(appId);
            });
        });
    }

    createAppCard(app) {
        const screenshotHtml = app.screenshot 
            ? `<img src="${app.screenshot}" alt="${app.name}" class="app-screenshot">`
            : `<div class="app-screenshot-placeholder">🌐</div>`;

        return `
            <div class="app-card ${app.isOnline ? 'online' : 'offline'}" data-app-id="${app.id}">
                ${screenshotHtml}
                <div class="app-content">
                    <div class="app-header">
                        <div>
                            <div class="app-name">${this.escapeHtml(app.name)}</div>
                            <span class="app-category category-${app.category}">${app.category}</span>
                        </div>
                    </div>
                    <div class="app-url">
                        <a href="${app.url}" target="_blank" onclick="event.stopPropagation()">${this.escapeHtml(app.url)}</a>
                    </div>
                    <div class="app-status">
                        <span class="status-indicator ${app.isOnline ? 'online' : 'offline'}"></span>
                        <span>${app.isOnline ? 'Online' : 'Offline'}</span>
                        ${app.responseTime ? `<span style="color: var(--text-muted)">· ${app.responseTime}ms</span>` : ''}
                    </div>
                    <div class="app-meta">
                        <span>Port: ${app.port}</span>
                        <span>${app.lastSeen ? this.formatTimeAgo(new Date(app.lastSeen)) : 'Never'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    async showAppDetails(appId) {
        try {
            const response = await fetch(`/api/apps/${appId}`);
            const app = await response.json();
            
            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            
            modalTitle.textContent = app.name;
            
            const screenshotHtml = app.screenshot 
                ? `<img src="${app.screenshot}" alt="${app.name}" class="detail-screenshot">`
                : '';
            
            modalBody.innerHTML = `
                ${screenshotHtml}
                <div class="detail-info">
                    <div class="detail-row">
                        <span class="detail-label">URL</span>
                        <span class="detail-value"><a href="${app.url}" target="_blank" style="color: var(--accent);">${app.url}</a></span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Port</span>
                        <span class="detail-value">${app.port}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Category</span>
                        <span class="detail-value category-${app.category}">${app.category}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Status</span>
                        <span class="detail-value">
                            <span class="status-indicator ${app.isOnline ? 'online' : 'offline'}"></span>
                            ${app.isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Response Time</span>
                        <span class="detail-value">${app.responseTime ? app.responseTime + 'ms' : 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Last Seen</span>
                        <span class="detail-value">${app.lastSeen ? this.formatTimeAgo(new Date(app.lastSeen)) : 'Never'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Discovered</span>
                        <span class="detail-value">${app.createdAt ? this.formatTimeAgo(new Date(app.createdAt)) : 'Unknown'}</span>
                    </div>
                </div>
                <div class="detail-actions">
                    <a href="${app.url}" target="_blank" class="btn btn-primary">Open App</a>
                    <button class="btn btn-secondary" onclick="appMonitor.reidentifyApp('${app.id}')">Re-identify with AI</button>
                    <button class="btn btn-danger" onclick="appMonitor.deleteApp('${app.id}')">Delete</button>
                </div>
            `;
            
            document.getElementById('app-modal').classList.add('active');
            
        } catch (error) {
            console.error('Failed to load app details:', error);
            this.showToast('error', 'Failed to load application details');
        }
    }

    switchView(view) {
        this.currentView = view;
        
        // Update nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });
        
        // Update title and subtitle
        const titles = {
            'dashboard': { title: 'Dashboard', subtitle: 'Overview of your local web applications' },
            'all-apps': { title: 'All Applications', subtitle: 'Manage your discovered web applications' },
            'online': { title: 'Online', subtitle: 'Applications that are currently running' },
            'offline': { title: 'Offline', subtitle: 'Applications that are not responding' },
            'settings': { title: 'Settings', subtitle: 'Configure your monitor' }
        };
        
        const info = titles[view] || { title: 'Dashboard', subtitle: '' };
        document.getElementById('page-title').textContent = info.title;
        document.getElementById('page-subtitle').textContent = info.subtitle;
        
        // Show/hide filters and actions
        const filterControls = document.querySelector('.filter-controls');
        const headerActions = document.querySelector('.header-actions');
        
        if (view === 'settings') {
            filterControls.style.display = 'none';
            headerActions.style.display = 'none';
            document.getElementById('apps-grid').innerHTML = this.getSettingsContent();
        } else {
            filterControls.style.display = 'flex';
            headerActions.style.display = 'flex';
            this.renderApps();
        }
    }

    getSettingsContent() {
        return `
            <div class="settings-section">
                <h3>Configuration</h3>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">
                    Settings are managed in config.json. Restart the server to apply changes.
                </p>
                
                <div class="detail-info" style="max-width: 600px;">
                    <div class="detail-row">
                        <span class="detail-label">Dashboard Port</span>
                        <span class="detail-value">3000</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Scan Interval</span>
                        <span class="detail-value">5 minutes</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Port Range</span>
                        <span class="detail-value">1-65535</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Screenshots</span>
                        <span class="detail-value">Enabled</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">AI Recognition</span>
                        <span class="detail-value">Ollama (llama3.2)</span>
                    </div>
                </div>
            </div>
        `;
    }

    async startQuickScan() {
        try {
            const response = await fetch('/api/scan/quick', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
        } catch (error) {
            this.showToast('error', `Quick scan failed: ${error.message}`);
        }
    }

    async startFullScan() {
        try {
            const response = await fetch('/api/scan/full', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
        } catch (error) {
            this.showToast('error', `Full scan failed: ${error.message}`);
        }
    }

    async runHealthCheck() {
        try {
            const response = await fetch('/api/health-check', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
        } catch (error) {
            this.showToast('error', `Health check failed: ${error.message}`);
        }
    }

    async addApp() {
        const url = document.getElementById('app-url').value;
        const name = document.getElementById('app-name').value;
        const category = document.getElementById('app-category').value;
        
        try {
            const response = await fetch('/api/apps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, name, category: category === 'Unknown' ? undefined : category })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            
            this.closeModal('add-app-modal');
            document.getElementById('add-app-form').reset();
        } catch (error) {
            this.showToast('error', `Failed to add app: ${error.message}`);
        }
    }

    async deleteApp(appId) {
        if (!confirm('Are you sure you want to delete this application?')) return;
        
        try {
            const response = await fetch(`/api/apps/${appId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete');
            
            this.closeModal('app-modal');
            this.showToast('success', 'Application deleted');
        } catch (error) {
            this.showToast('error', `Failed to delete: ${error.message}`);
        }
    }

    async reidentifyApp(appId) {
        try {
            const response = await fetch(`/api/ai/identify/${appId}`, { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            
            this.showToast('success', `Re-identified as: ${data.identification.name}`);
            this.loadApps();
            this.closeModal('app-modal');
        } catch (error) {
            this.showToast('error', `Re-identification failed: ${error.message}`);
        }
    }

    updateAppStatus(data) {
        const app = this.apps.find(a => a.url === data.url);
        if (app) {
            app.isOnline = data.status === 'online';
            app.responseTime = data.responseTime;
            app.lastSeen = new Date().toISOString();
            this.renderApps();
            this.loadApps();
        }
    }

    async checkOllamaStatus() {
        try {
            const response = await fetch('/api/ai/status');
            const data = await response.json();
            
            const statusEl = document.getElementById('ollama-status');
            if (data.available) {
                statusEl.classList.add('available');
                statusEl.classList.remove('unavailable');
                statusEl.querySelector('.status-text').textContent = `AI: ${data.models[0] || 'Ollama'} available`;
            } else {
                statusEl.classList.add('unavailable');
                statusEl.classList.remove('available');
                statusEl.querySelector('.status-text').textContent = 'AI: Ollama not available';
            }
        } catch (error) {
            const statusEl = document.getElementById('ollama-status');
            statusEl.classList.add('unavailable');
            statusEl.querySelector('.status-text').textContent = 'AI: Unable to check';
        }
    }

    showLoading(text) {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').classList.add('active');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    showToast(type, message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>${message}</span>
        `;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        
        return date.toLocaleDateString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the application
let appMonitor;
document.addEventListener('DOMContentLoaded', () => {
    appMonitor = new WebAppMonitor();
});