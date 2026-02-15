const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
let config = require('./config.json');
const database = require('./database/db');
const { getTargetIP, getLANIpAddress, convertToLANUrl, isLocalhostUrl, isDockerContainer } = require('./utils/networkUtils');

// Import agents
const PortScanner = require('./agents/portScanner');
const HealthChecker = require('./agents/healthChecker');
const ScreenshotAgent = require('./agents/screenshotAgent');
const AIAgent = require('./agents/aiAgent');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize agents
const portScanner = new PortScanner();
const healthChecker = new HealthChecker();
const screenshotAgent = new ScreenshotAgent();
const aiAgent = new AIAgent();

// WebSocket for real-time updates (Socket.IO)
io.on('connection', (socket) => {
    console.log('[Server] Socket.IO client connected');
    
    socket.on('disconnect', () => {
        console.log('[Server] Socket.IO client disconnected');
    });
});

function broadcast(data) {
    io.emit('message', data);
}

// Prefer a configured target host (from config.json) when converting URLs —
// falls back to auto-detected LAN IP
function getPreferredTarget() {
    if (config && config.targetHost && config.targetHost !== 'localhost') {
        return config.targetHost;
    }
    return getTargetIP();
}

function extractLanHostFromRequest(req) {
    // Prefer forwarded host (if behind proxy), else use Host header
    const rawHost = (req.headers['x-forwarded-host'] || req.headers['host'] || '').toString();
    const firstHost = rawHost.split(',')[0].trim();
    const hostOnly = firstHost.replace(/:\d+$/, '');

    // We only trust private LAN IPv4 hosts for URL rewriting
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostOnly)) return hostOnly;

    return null;
}

function getResponseTargetHost(req) {
    // 1) Explicit config override
    if (config && config.targetHost && config.targetHost !== 'localhost') {
        return config.targetHost;
    }

    // 2) If a client accesses the dashboard via a LAN IP, echo that back in converted URLs.
    // This makes links usable from phones/other computers on the LAN.
    const reqLanHost = extractLanHostFromRequest(req);
    if (reqLanHost) {
        // Learn the correct LAN host automatically when someone accesses the dashboard via LAN.
        // This ensures WebSocket broadcasts and future requests also use the 192.168.* address.
        if (config && (!config.targetHost || config.targetHost === 'localhost')) {
            config.targetHost = reqLanHost;
            try {
                const fs = require('fs');
                fs.writeFileSync(require('path').join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
            } catch (e) {
                // Non-fatal
            }
        }
        return reqLanHost;
    }

    // 3) Fallback to auto-detection/env override
    return getTargetIP();
}

// ==================== API ENDPOINTS ====================

// Get all apps
app.get('/api/apps', (req, res) => {
    const apps = database.getAllApps();
    const stats = database.getStats();
    const lanIp = getResponseTargetHost(req);
    
    // Convert screenshots to base64 data URLs and add computed fields
    // Also convert localhost URLs to LAN IP for external access
    const appsWithScreenshots = apps.map(app => ({
        ...app,
        url: convertToLANUrl(app.url, lanIp),
        isOnline: app.status === 'online',
        lastSeen: app.last_checked_at,
        createdAt: app.discovered_at,
        screenshot: app.screenshot 
            ? `data:image/png;base64,${app.screenshot.toString('base64')}` 
            : null,
        thumbnail: app.thumbnail 
            ? `data:image/png;base64,${app.thumbnail.toString('base64')}` 
            : (app.screenshot ? `data:image/png;base64,${app.screenshot.toString('base64')}` : null)
    }));
    
    res.json({ apps: appsWithScreenshots, stats });
});

// Get single app
app.get('/api/apps/:id', (req, res) => {
    const app = database.getApp(req.params.id);
    if (!app) {
        return res.status(404).json({ error: 'App not found' });
    }
    
    const history = database.getScanHistory(req.params.id);
    const lanIp = getResponseTargetHost(req);
    
    res.json({
        ...app,
        url: convertToLANUrl(app.url, lanIp),
        isOnline: app.status === 'online',
        lastSeen: app.last_checked_at,
        createdAt: app.discovered_at,
        screenshot: app.screenshot 
            ? `data:image/png;base64,${app.screenshot.toString('base64')}` 
            : null,
        thumbnail: app.thumbnail 
            ? `data:image/png;base64,${app.thumbnail.toString('base64')}` 
            : (app.screenshot ? `data:image/png;base64,${app.screenshot.toString('base64')}` : null),
        history
    });
});

// Delete app
app.delete('/api/apps/:id', (req, res) => {
    const appId = parseInt(req.params.id, 10);
    if (isNaN(appId)) {
        return res.status(400).json({ error: 'Invalid app ID' });
    }
    database.removeApp(appId);
    res.json({ success: true });
});

// Update app
app.put('/api/apps/:id', (req, res) => {
    const { name, notes } = req.body;
    const app = database.getApp(req.params.id);
    if (!app) {
        return res.status(404).json({ error: 'App not found' });
    }
    
    // Update fields
    const db = require('better-sqlite3')(database.db.name);
    // Note: In real implementation, add proper update methods
    
    const updatedApp = database.getApp(req.params.id);
    // Convert URL to LAN IP for network accessibility
    const lanIp = getResponseTargetHost(req);
    const updatedAppWithLanUrl = {
        ...updatedApp,
        url: convertToLANUrl(updatedApp.url, lanIp)
    };
    res.json({ success: true, app: updatedAppWithLanUrl });
});

// Get stats
app.get('/api/stats', (req, res) => {
    res.json(database.getStats());
});

// ==================== SCAN ENDPOINTS ====================

// Start quick scan
app.post('/api/scan/quick', async (req, res) => {
    console.log('[Server] Starting quick scan...');
    broadcast({ type: 'scan_start', mode: 'quick' });
    
    try {
        const discovered = await portScanner.quickScan();
        
        // Process discovered servers
        for (const server of discovered) {
            // Get page content for AI identification
            const content = await screenshotAgent.getPageContent(server.url);
            
            // Identify using AI
            const identification = await aiAgent.identifyApp(server.url, content.title, content);
            
            // Add to database
            const app = database.addApp(server.url, server.port, identification.name, identification.category);
            
            // Check health
            const health = await healthChecker.check(server.url);
            database.recordScan(server.url, health.status, health.responseTime);
            
            // Convert URL to LAN IP for network accessibility
            const lanIp = getResponseTargetHost(req);
            const appWithLanUrl = {
                ...app,
                ...identification,
                url: convertToLANUrl(app.url, lanIp)
            };
            broadcast({ type: 'app_discovered', app: appWithLanUrl });
        }
        
        broadcast({ type: 'scan_complete', mode: 'quick', found: discovered.length });
        res.json({ success: true, found: discovered.length });
        
    } catch (error) {
        console.error('[Server] Quick scan error:', error);
        broadcast({ type: 'scan_error', error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Start full scan
app.post('/api/scan/full', async (req, res) => {
    console.log('[Server] Starting full scan...');
    broadcast({ type: 'scan_start', mode: 'full' });
    
    try {
        const discovered = await portScanner.scan();
        
        // Process discovered servers
        for (const server of discovered) {
            const content = await screenshotAgent.getPageContent(server.url);
            const identification = await aiAgent.identifyApp(server.url, content.title, content);
            const app = database.addApp(server.url, server.port, identification.name, identification.category);
            
            const health = await healthChecker.check(server.url);
            database.recordScan(server.url, health.status, health.responseTime);
            
            // Update metadata if available
            if (health.metaData) {
                database.updateMetadata(
                    server.url,
                    health.metaData.name,
                    health.metaData.description,
                    health.metaData.category
                );
            }
            
            // Convert URL to LAN IP for network accessibility
            const lanIp = getResponseTargetHost(req);
            const appWithLanUrl = {
                ...app,
                ...identification,
                url: convertToLANUrl(app.url, lanIp)
            };
            broadcast({ type: 'app_discovered', app: appWithLanUrl });
        }
        
        broadcast({ type: 'scan_complete', mode: 'full', found: discovered.length });
        res.json({ success: true, found: discovered.length });
        
    } catch (error) {
        console.error('[Server] Full scan error:', error);
        broadcast({ type: 'scan_error', error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Health check all apps
app.post('/api/health-check', async (req, res) => {
    console.log('[Server] Running health check...');
    broadcast({ type: 'health_check_start' });
    
    try {
        const apps = database.getAllApps();
        const results = await healthChecker.checkAll(apps);
        
        let online = 0;
        let offline = 0;
        
        for (const result of results) {
            database.recordScan(result.url, result.status, result.responseTime);
            
            // Update metadata if available
            if (result.metaData && result.status === 'online') {
                database.updateMetadata(
                    result.url,
                    result.metaData.name,
                    result.metaData.description,
                    result.metaData.category
                );
            }
            
            if (result.status === 'online') online++;
            else offline++;
            
            broadcast({ type: 'health_update', ...result });
        }
        
        broadcast({ type: 'health_check_complete', online, offline });
        res.json({ success: true, online, offline });
        
    } catch (error) {
        console.error('[Server] Health check error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update screenshots
app.post('/api/screenshots/update', async (req, res) => {
    console.log('[Server] Updating screenshots...');
    broadcast({ type: 'screenshot_update_start' });
    
    try {
        const apps = database.getOnlineApps();
        
        for (const app of apps) {
            console.log(`[Server] Capturing screenshot for ${app.url}...`);
            const result = await screenshotAgent.captureScreenshot(app.url, app.id);
            
            if (result.success) {
                database.updateScreenshot(app.id, result.buffer, result.thumbnail);
                broadcast({ 
                    type: 'screenshot_updated', 
                    appId: app.id,
                    success: true 
                });
            } else {
                broadcast({ 
                    type: 'screenshot_updated', 
                    appId: app.id,
                    success: false,
                    error: result.error
                });
            }
        }
        
        broadcast({ type: 'screenshot_update_complete' });
        res.json({ success: true });
        
    } catch (error) {
        console.error('[Server] Screenshot update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Refresh screenshots (alias for /api/screenshots/update)
app.post('/api/screenshots/refresh', async (req, res) => {
    console.log('[Server] Refreshing screenshots...');
    broadcast({ type: 'screenshot_update_start' });
    
    try {
        const apps = database.getOnlineApps();
        
        for (const app of apps) {
            console.log(`[Server] Capturing screenshot for ${app.url}...`);
            const result = await screenshotAgent.captureScreenshot(app.url, app.id);
            
            if (result.success) {
                database.updateScreenshot(app.id, result.buffer, result.thumbnail);
                broadcast({ 
                    type: 'screenshot_updated', 
                    appId: app.id,
                    success: true 
                });
            } else {
                broadcast({ 
                    type: 'screenshot_updated', 
                    appId: app.id,
                    success: false,
                    error: result.error
                });
            }
        }
        
        broadcast({ type: 'screenshot_update_complete' });
        res.json({ success: true });
        
    } catch (error) {
        console.error('[Server] Screenshot refresh error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update screenshot for a single app
app.post('/api/apps/:id/screenshot', async (req, res) => {
    const { id } = req.params;
    console.log(`[Server] Updating screenshot for app ID ${id}...`);
    
    try {
        const app = database.getAppById(id);
        if (!app) {
            return res.status(404).json({ error: 'App not found' });
        }
        
        const result = await screenshotAgent.captureScreenshot(app.url, app.id);
        
        if (result.success) {
            database.updateScreenshot(app.id, result.buffer, result.thumbnail);
            res.json({ success: true });
        } else {
            res.status(500).json({ error: result.error || 'Failed to capture screenshot' });
        }
        
    } catch (error) {
        console.error('[Server] Single screenshot update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Manually add app
app.post('/api/apps', async (req, res) => {
    const { url, name, category } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    try {
        const port = new URL(url).port;
        const app = database.addApp(url, port, name, category || 'Unknown');
        
        // Health check
        const health = await healthChecker.check(url);
        database.recordScan(url, health.status, health.responseTime);
        
        // Convert URL to LAN IP for network accessibility
        const lanIp = getResponseTargetHost(req);
        const appWithLanUrl = {
            ...app,
            url: convertToLANUrl(app.url, lanIp)
        };
        broadcast({ type: 'app_added', app: appWithLanUrl });
        res.json({ success: true, app: appWithLanUrl });
        
    } catch (error) {
        console.error('[Server] Add app error:', error);
        res.status(500).json({ error: error.message });
    }
});

// AI identification
app.post('/api/ai/identify/:id', async (req, res) => {
    try {
        const app = database.getApp(req.params.id);
        if (!app) {
            return res.status(404).json({ error: 'App not found' });
        }
        
        const content = await screenshotAgent.getPageContent(app.url);
        const identification = await aiAgent.identifyApp(app.url, content.title, content);
        
        // Update database
        const db = require('./database/db');
        db.addApp(app.url, app.port, identification.name, identification.category);
        
        const updatedApp = database.getApp(req.params.id);
        
        // Convert URL to LAN IP for network accessibility
        const lanIp = getResponseTargetHost(req);
        const updatedAppWithLanUrl = {
            ...updatedApp,
            url: convertToLANUrl(updatedApp.url, lanIp)
        };
        broadcast({ type: 'app_updated', app: updatedAppWithLanUrl });
        
        res.json({ success: true, identification });
        
    } catch (error) {
        console.error('[Server] AI identify error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ollama status
app.get('/api/ai/status', async (req, res) => {
    const available = await aiAgent.isAvailable();
    const models = available ? await aiAgent.getModels() : [];
    res.json({ 
        available, 
        models,
        baseUrl: aiAgent.baseUrl,
        model: aiAgent.model
    });
});

// Test Ollama connection
app.post('/api/ai/test', async (req, res) => {
    try {
        const { baseUrl } = req.body;
        const testAgent = new (require('./agents/aiAgent'))();
        if (baseUrl) {
            testAgent.baseUrl = baseUrl;
        }
        const available = await testAgent.isAvailable();
        const models = available ? await testAgent.getModels() : [];
        res.json({ 
            success: true,
            available, 
            models,
            baseUrl: testAgent.baseUrl
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// UI configuration endpoint: get and set basic UI settings (targetHost)
app.get('/api/ui/config', (req, res) => {
    res.json({ targetHost: config.targetHost || 'localhost' });
});

app.post('/api/ui/config', (req, res) => {
    const { targetHost } = req.body || {};
    if (targetHost && typeof targetHost === 'string') {
        config.targetHost = targetHost;
        // Persist to config.json if possible
        try {
            const fs = require('fs');
            fs.writeFileSync(require('path').join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
        } catch (e) {
            // If we can't persist, keep in-memory and return success
            console.warn('[Server] Could not persist UI config:', e.message);
        }
        return res.json({ success: true, targetHost: config.targetHost });
    }
    res.status(400).json({ success: false, error: 'Invalid targetHost' });
});

// Set Ollama model
app.post('/api/ai/model', async (req, res) => {
    try {
        const { model } = req.body;
        if (!model) {
            return res.status(400).json({ success: false, error: 'Model name is required' });
        }
        
        // Update the model in the aiAgent
        aiAgent.model = model;
        console.log(`[Server] Ollama model set to: ${model}`);
        
        res.json({ success: true, model: aiAgent.model });
    } catch (error) {
        console.error('[Server] Error setting model:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== INITIALIZATION ====================

async function initialize() {
    console.log('[Server] Initializing Local WebApp Monitor...');

    // Start server ASAP so the dashboard/API is reachable even if scanning/screenshotting takes time.
    const port = config.dashboardPort === 'auto' ? 3000 : config.dashboardPort;
    const publicHost = getPreferredTarget();
    server.listen(port, '0.0.0.0', () => {
        console.log(`[Server] Dashboard running at http://localhost:${port}`);
        if (publicHost) {
            console.log(`[Server] Network access: http://${publicHost}:${port}`);
        }
        console.log('[Server] Ready to monitor your local web applications!');
    });
    
    // Run quick scan on startup (async, do not block server listen)
    (async () => {
        console.log('[Server] Running initial quick scan...');
        try {
            const discovered = await portScanner.quickScan();

            for (const srv of discovered) {
                const content = await screenshotAgent.getPageContent(srv.url);
                const identification = await aiAgent.identifyApp(srv.url, content.title, content);
                database.addApp(srv.url, srv.port, identification.name, identification.category);

                const health = await healthChecker.check(srv.url);
                database.recordScan(srv.url, health.status, health.responseTime);

                console.log(`[Server] Discovered: ${identification.name} at ${srv.url}`);
            }

            console.log(`[Server] Initial scan found ${discovered.length} applications`);
        } catch (error) {
            console.error('[Server] Initial scan error:', error);
        }
    })();
    
    // Start periodic health checks
    setInterval(async () => {
        console.log('[Server] Running periodic health check...');
        try {
            const apps = database.getAllApps();
            const results = await healthChecker.checkAll(apps);
            
            for (const result of results) {
                database.recordScan(result.url, result.status, result.responseTime);
            }
            
            broadcast({ type: 'periodic_health_check', updated: results.length });
        } catch (error) {
            console.error('[Server] Periodic health check error:', error);
        }
    }, config.scanIntervalMs);
    
    // server.listen() is called above
}

// Handle shutdown
process.on('SIGINT', async () => {
    console.log('\n[Server] Shutting down...');
    await screenshotAgent.closeBrowser();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[Server] Shutting down...');
    await screenshotAgent.closeBrowser();
    process.exit(0);
});

// Start
initialize();