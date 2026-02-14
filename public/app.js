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
        // Apply persisted theme if available
        this.loadTheme();
        await this.checkOllamaStatus();
    }

    // Load theme from localStorage and apply
    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        this.setTheme(theme);
    }

    // Set theme and update UI
    setTheme(theme) {
        this.theme = theme;
        try {
            localStorage.setItem('theme', theme);
        } catch (e) {
            // ignore storage errors
        }
        document.body.classList.remove('light', 'dark', 'auto');
        document.body.classList.add(theme);
        // Update active button
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset && btn.dataset.theme === theme) {
                btn.classList.add('active');
            }
        });
    }

    // Clear local storage data
    clearData() {
        try {
            localStorage.clear();
        } catch (e) {}
        // optionally inform backend or reset DB - for now just reload
        if (confirm('Clear local settings and reload the dashboard?')) {
            location.reload();
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const view = item.dataset.view;
                if (view) this.switchView(view);
            });
        });

        // Add app nav
        document.getElementById('add-app-nav').addEventListener('click', () => {
            document.getElementById('add-app-modal').classList.add('active');
        });

        // Settings nav
        document.getElementById('settings-nav').addEventListener('click', () => {
            document.getElementById('settings-modal').classList.add('active');
        });

        // Settings modal close
        document.getElementById('settings-modal-close').addEventListener('click', () => {
            this.closeModal('settings-modal');
        });

        // Scan buttons
        document.getElementById('quick-scan-btn').addEventListener('click', () => this.startQuickScan());
        document.getElementById('full-scan-btn').addEventListener('click', () => this.startFullScan());
        document.getElementById('health-check-btn').addEventListener('click', () => this.runHealthCheck());
        document.getElementById('empty-scan-btn').addEventListener('click', () => this.startQuickScan());

        // Search
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filter.search = e.target.value.toLowerCase();
            this.renderApps();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filter.status = btn.dataset.filter;
                this.renderApps();
            });
        });

        // Modal close buttons
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal('app-modal'));
        document.getElementById('add-app-modal-close').addEventListener('click', () => this.closeModal('add-app-modal'));

        // Add app form
        document.getElementById('add-app-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addApp();
        });

        // Modal action buttons
        document.getElementById('modal-open-btn').addEventListener('click', () => {
            if (this.selectedApp) {
                window.open(this.selectedApp.url, '_blank');
            }
        });

        document.getElementById('modal-delete-btn').addEventListener('click', () => {
            if (this.selectedApp) {
                this.deleteApp(this.selectedApp.id);
            }
        });

        document.getElementById('modal-reidentify-btn').addEventListener('click', () => {
            if (this.selectedApp) {
                this.reidentifyApp(this.selectedApp.id);
            }
        });

        // Settings action buttons
        document.getElementById('theme-light-btn').addEventListener('click', () => this.setTheme('light'));
        document.getElementById('theme-dark-btn').addEventListener('click', () => this.setTheme('dark'));
        document.getElementById('theme-auto-btn').addEventListener('click', () => this.setTheme('auto'));
        document.getElementById('screenshot-refresh-btn').addEventListener('click', () => this.refreshScreenshots());
        document.getElementById('clear-data-btn').addEventListener('click', () => this.clearData());

        // Auto-refresh toggle
        document.getElementById('auto-refresh-toggle').addEventListener('change', (e) => {
            this.setAutoRefresh(e.target.checked);
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
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('[Socket.IO] Connected');
        });

        this.socket.on('message', (data) => {
            this.handleWebSocketMessage(data);
        });

        this.socket.on('disconnect', () => {
            console.log('[Socket.IO] Disconnected, reconnecting...');
        });

        this.socket.on('connect_error', (error) => {
            console.error('[Socket.IO] Error:', error);
        });
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
            
            let matchesStatus = true;
            if (this.filter.status === 'online') matchesStatus = app.isOnline;
            if (this.filter.status === 'offline') matchesStatus = !app.isOnline;
            
            return matchesSearch && matchesStatus;
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
            ? `<img src="${app.screenshot}" alt="${app.name}" class="app-screenshot" onerror="this.parentElement.innerHTML='<div class=\\'app-screenshot-placeholder\\'>🌐</div>'">`
            : `<div class="app-screenshot-placeholder"><i class="fas fa-globe"></i></div>`;

        const statusDot = app.isOnline ? 'online' : 'offline';
        const statusText = app.isOnline ? 'Online' : 'Offline';
        
        return `
            <div class="app-card ${app.isOnline ? '' : 'offline'}" data-app-id="${app.id}">
                <div class="app-card-header">
                    ${screenshotHtml}
                    <div class="app-status-badge">
                        <span class="status-dot ${statusDot}"></span>
                        ${statusText}
                    </div>
                    <span class="category-badge">${app.category}</span>
                </div>
                <div class="app-card-body">
                    <div class="app-card-title">
                        <i class="fas fa-cube"></i>
                        ${this.escapeHtml(app.name)}
                    </div>
                    <div class="app-url">
                        <a href="${app.url}" target="_blank" onclick="event.stopPropagation()">
                            <i class="fas fa-external-link-alt"></i>
                            ${this.escapeHtml(app.url)}
                        </a>
                    </div>
                    <div class="app-meta-row">
                        <div class="app-response-time">
                            <i class="fas fa-clock"></i>
                            ${app.responseTime ? app.responseTime + 'ms' : 'N/A'}
                        </div>
                        <div class="app-last-seen">
                            <i class="far fa-clock"></i>
                            ${app.lastSeen ? this.formatTimeAgo(new Date(app.lastSeen)) : 'Never'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async showAppDetails(appId) {
        try {
            const response = await fetch(`/api/apps/${appId}`);
            const app = await response.json();
            this.selectedApp = app;
            
            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            
            modalTitle.textContent = app.name;
            
            const screenshotHtml = app.screenshot 
                ? `<img src="${app.screenshot}" alt="${app.name}" style="width:100%;border-radius:8px;margin-bottom:16px;" onerror="this.style.display='none'">`
                : '';
            
            modalBody.innerHTML = `
                ${screenshotHtml}
                <div style="margin-bottom: 20px;">
                    <div class="detail-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <span style="color:var(--text-secondary);font-size:13px;">URL</span>
                        <a href="${app.url}" target="_blank" style="color:var(--accent);font-size:14px;">${app.url}</a>
                    </div>
                    <div class="detail-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <span style="color:var(--text-secondary);font-size:13px;">Port</span>
                        <span style="font-size:14px;">${app.port}</span>
                    </div>
                    <div class="detail-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <span style="color:var(--text-secondary);font-size:13px;">Category</span>
                        <span style="font-size:14px;">${app.category}</span>
                    </div>
                    <div class="detail-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <span style="color:var(--text-secondary);font-size:13px;">Status</span>
                        <span style="font-size:14px;">
                            <span class="status-indicator ${app.isOnline ? 'online' : 'offline'}"></span>
                            ${app.isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                    <div class="detail-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <span style="color:var(--text-secondary);font-size:13px;">Response Time</span>
                        <span style="font-size:14px;">${app.responseTime ? app.responseTime + 'ms' : 'N/A'}</span>
                    </div>
                    <div class="detail-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <span style="color:var(--text-secondary);font-size:13px;">Last Seen</span>
                        <span style="font-size:14px;">${app.lastSeen ? this.formatTimeAgo(new Date(app.lastSeen)) : 'Never'}</span>
                    </div>
                    <div class="detail-row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <span style="color:var(--text-secondary);font-size:13px;">Discovered</span>
                        <span style="font-size:14px;">${app.createdAt ? this.formatTimeAgo(new Date(app.createdAt)) : 'Unknown'}</span>
                    </div>
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
        
        // Update section title
        const sectionTitles = {
            'dashboard': 'All Applications',
            'all-apps': 'All Applications',
            'online': 'Online Applications',
            'offline': 'Offline Applications',
            'settings': 'Settings'
        };
        document.getElementById('section-title').textContent = sectionTitles[view] || 'Applications';
        
        // Reset filter buttons for non-status views
        if (view !== 'online' && view !== 'offline') {
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.filter === 'all');
            });
            this.filter.status = 'all';
        }
        
        this.renderApps();
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
            this.updateStats({
                totalApps: this.apps.length,
                onlineApps: this.apps.filter(a => a.isOnline).length,
                offlineApps: this.apps.filter(a => !a.isOnline).length
            });
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
            } else {
                statusEl.classList.add('unavailable');
                statusEl.classList.remove('available');
            }
        } catch (error) {
            const statusEl = document.getElementById('ollama-status');
            statusEl.classList.add('unavailable');
            statusEl.classList.remove('available');
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
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <span class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></span>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
        `;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
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