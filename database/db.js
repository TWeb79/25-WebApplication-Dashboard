const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'apps.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        url TEXT UNIQUE,
        port INTEGER,
        status TEXT DEFAULT 'unknown',
        screenshot BLOB,
        screenshot_updated_at DATETIME,
        category TEXT,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_checked_at DATETIME,
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS scan_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER,
        status TEXT,
        response_time_ms INTEGER,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (app_id) REFERENCES apps(id)
    );

    CREATE INDEX IF NOT EXISTS idx_apps_url ON apps(url);
    CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
    CREATE INDEX IF NOT EXISTS idx_scan_history_app_id ON scan_history(app_id);
`);

// Prepared statements for better performance
const insertApp = db.prepare(`
    INSERT OR IGNORE INTO apps (url, port, name, category, discovered_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const updateAppStatus = db.prepare(`
    UPDATE apps SET status = ?, last_checked_at = CURRENT_TIMESTAMP WHERE url = ?
`);

const updateAppName = db.prepare(`UPDATE apps SET name = ? WHERE url = ?`);
const updateAppCategory = db.prepare(`UPDATE apps SET category = ? WHERE url = ?`);

const updateScreenshot = db.prepare(`
    UPDATE apps SET screenshot = ?, screenshot_updated_at = CURRENT_TIMESTAMP WHERE id = ?
`);

const deleteScanHistory = db.prepare(`DELETE FROM scan_history WHERE app_id = ?`);
const deleteApp = db.prepare(`DELETE FROM apps WHERE id = ?`);
const getAppById = db.prepare(`SELECT * FROM apps WHERE id = ?`);
const getAppByUrl = db.prepare(`SELECT * FROM apps WHERE url = ?`);
const getAllApps = db.prepare(`SELECT * FROM apps ORDER BY discovered_at DESC`);
const getOnlineApps = db.prepare(`SELECT * FROM apps WHERE status = 'online' ORDER BY last_checked_at DESC`);

const insertScanHistory = db.prepare(`
    INSERT INTO scan_history (app_id, status, response_time_ms)
    VALUES (?, ?, ?)
`);

const getScanHistory = db.prepare(`
    SELECT * FROM scan_history WHERE app_id = ? ORDER BY checked_at DESC LIMIT 50
`);

// Database operations
const database = {
    // Add or ignore app (won't duplicate)
    addApp: (url, port, name = null, category = null) => {
        const existing = getAppByUrl.get(url);
        if (existing) {
            // Update name/category if provided and existing is null
            if (name && !existing.name) updateAppName.run(name, url);
            if (category && !existing.category) updateAppCategory.run(category, url);
            return existing;
        }
        insertApp.run(url, port, name || `Port ${port}`, category || 'Unknown');
        return getAppByUrl.get(url);
    },

    // Update app status
    updateStatus: (url, status) => {
        const app = getAppByUrl.get(url);
        if (app) {
            updateAppStatus.run(status, url);
            insertScanHistory.run(app.id, status, app.responseTime || 0);
        }
    },

    // Record scan history with response time
    recordScan: (url, status, responseTimeMs) => {
        const app = getAppByUrl.get(url);
        if (app) {
            updateAppStatus.run(status, url);
            insertScanHistory.run(app.id, status, responseTimeMs);
        }
    },

    // Update screenshot
    updateScreenshot: (id, screenshotBuffer) => {
        updateScreenshot.run(screenshotBuffer, id);
    },

    // Get screenshot
    getScreenshot: (id) => {
        const app = getAppById.get(id);
        return app?.screenshot;
    },

    // Remove app and related scan history
    removeApp: (id) => {
        // First delete related scan history records
        deleteScanHistory.run(id);
        // Then delete the app
        deleteApp.run(id);
    },

    // Get single app
    getApp: (id) => {
        return getAppById.get(id);
    },

    // Get app by URL
    getAppByUrl: (url) => {
        return getAppByUrl.get(url);
    },

    // Get all apps
    getAllApps: () => {
        return getAllApps.all();
    },

    // Get online apps only
    getOnlineApps: () => {
        return getOnlineApps.all();
    },

    // Get scan history for an app
    getScanHistory: (appId) => {
        return getScanHistory.all(appId);
    },

    // Get dashboard stats
    getStats: () => {
        const apps = getAllApps.all();
        return {
            total: apps.length,
            online: apps.filter(a => a.status === 'online').length,
            offline: apps.filter(a => a.status === 'offline').length,
            unknown: apps.filter(a => a.status === 'unknown').length
        };
    }
};

module.exports = database;