const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config.json');
const database = require('./database/db');

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

// ==================== API ENDPOINTS ====================

// Get all apps
app.get('/api/apps', (req, res) => {
    const apps = database.getAllApps();
    const stats = database.getStats();
    
    // Convert screenshots to base64 data URLs and add computed fields
    const appsWithScreenshots = apps.map(app => ({
        ...app,
        isOnline: app.status === 'online',
        lastSeen: app.last_checked_at,
        createdAt: app.discovered_at,
        screenshot: app.screenshot 
            ? `data:image/png;base64,${app.screenshot.toString('base64')}` 
            : null
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
    
    res.json({
        ...app,
        isOnline: app.status === 'online',
        lastSeen: app.last_checked_at,
        createdAt: app.discovered_at,
        screenshot: app.screenshot 
            ? `data:image/png;base64,${app.screenshot.toString('base64')}` 
            : null,
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
    res.json({ success: true, app: database.getApp(req.params.id) });
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
            
            broadcast({ type: 'app_discovered', app: { ...app, ...identification } });
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
            
            broadcast({ type: 'app_discovered', app: { ...app, ...identification } });
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
                database.updateScreenshot(app.id, result.buffer);
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
        
        broadcast({ type: 'app_added', app });
        res.json({ success: true, app });
        
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
        broadcast({ type: 'app_updated', app: updatedApp });
        
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
    res.json({ available, models });
});

// ==================== INITIALIZATION ====================

async function initialize() {
    console.log('[Server] Initializing Local WebApp Monitor...');
    
    // Run quick scan on startup
    console.log('[Server] Running initial quick scan...');
    try {
        const discovered = await portScanner.quickScan();
        
        for (const server of discovered) {
            const content = await screenshotAgent.getPageContent(server.url);
            const identification = await aiAgent.identifyApp(server.url, content.title, content);
            const app = database.addApp(server.url, server.port, identification.name, identification.category);
            
            const health = await healthChecker.check(server.url);
            database.recordScan(server.url, health.status, health.responseTime);
            
            console.log(`[Server] Discovered: ${identification.name} at ${server.url}`);
        }
        
        console.log(`[Server] Initial scan found ${discovered.length} applications`);
    } catch (error) {
        console.error('[Server] Initial scan error:', error);
    }
    
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
    
    // Start server
    const port = config.dashboardPort === 'auto' ? 3000 : config.dashboardPort;
    server.listen(port, '0.0.0.0', () => {
        console.log(`[Server] Dashboard running at http://localhost:${port}`);
        console.log('[Server] Ready to monitor your local web applications!');
    });
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