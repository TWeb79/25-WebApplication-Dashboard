/**
 * Network Utility Module
 * Provides functions to detect LAN IP addresses and convert localhost URLs
 */

const os = require('os');

/**
 * Check if running inside a Docker container
 * @returns {boolean} True if running in Docker
 */
function isDockerContainer() {
    return process.env.DOCKER_CONTAINER === 'true' || 
           process.env.DOCKER_CONTAINER === true ||
           process.env.DOCKER_CONTAINER === '1';
}

/**
 * Get all network interfaces
 * @returns {Object} Network interfaces
 */
function getNetworkInterfaces() {
    return os.networkInterfaces();
}

/**
 * Find the first LAN IP address that starts with 192.168.x.x
 * Fallsback to other private ranges, preferring 192.168.x.x over Docker bridge (172.17.x.x)
 * @returns {string|null} LAN IP address or null if not found
 */
function getLANIpAddress() {
    const interfaces = getNetworkInterfaces();
    
    // Priority 1: 192.168.x.x range (most common home/office network)
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.internal || iface.family !== 'IPv4') continue;
            const ip = iface.address;
            if (ip.startsWith('192.168.')) {
                return ip;
            }
        }
    }
    
    // Priority 2: 10.x.x.x range
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.internal || iface.family !== 'IPv4') continue;
            const ip = iface.address;
            if (ip.startsWith('10.')) {
                return ip;
            }
        }
    }
    
    // Priority 3: 172.16-31.x.x range (excluding Docker bridge 172.17.x.x)
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.internal || iface.family !== 'IPv4') continue;
            const ip = iface.address;
            if (ip.startsWith('172.')) {
                const secondOctet = parseInt(ip.split('.')[1]);
                // Skip Docker bridge network (172.17.x.x) - not accessible from host network
                if (secondOctet === 17) continue;
                if (secondOctet >= 16 && secondOctet <= 31) {
                    return ip;
                }
            }
        }
    }
    
    // Priority 4: If no other option, use any non-internal IPv4 (including 172.17.x.x as last resort)
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.internal || iface.family !== 'IPv4') continue;
            return iface.address;
        }
    }
    
    return null;
}

/**
 * Best-effort: detect the host's LAN IP from inside a Docker container.
 * This relies on a modern Linux route file being available in the container.
 * If it fails, returns null.
 */
function getDockerHostLanIp() {
    try {
        const fs = require('fs');
        const route = fs.readFileSync('/proc/net/route', 'utf8');
        // Find default route line (Destination == 00000000)
        const lines = route.split(/\r?\n/);
        const def = lines.find(l => l && l.split(/\t|\s+/)[1] === '00000000');
        if (!def) return null;
        const iface = def.split(/\t|\s+/)[0];
        const ifaces = os.networkInterfaces();
        const entries = ifaces[iface] || [];
        for (const e of entries) {
            if (e.family === 'IPv4' && !e.internal) {
                // This is usually the container IP, not host
                break;
            }
        }
        return null;
    } catch (_) {
        return null;
    }
}

/**
 * Get the target IP for URL conversion
 * In Docker, uses host.docker.internal; otherwise tries to detect LAN IP
 * @returns {string|null} Target IP address or null
 */
function getTargetIP() {
    // Allow an explicit override via environment variable (useful in Docker Compose)
    if (process.env.TARGET_HOST) {
        return process.env.TARGET_HOST;
    }

    // Prefer an auto-detected LAN IP (192.168.x.x, then 10.x.x.x, then private 172.16-31.x.x).
    // This ensures URLs returned to clients on the same network are reachable from other devices.
    // If we're running in Docker, we can't directly see the host's LAN interface.
    // Therefore, we intentionally DO NOT return the container IP (172.x).
    // Instead:
    // - prefer TARGET_HOST (env) or config.targetHost (handled at server layer)
    // - fallback to host.docker.internal so the app can still reach services on the host
    if (!isDockerContainer()) {
        const lan = getLANIpAddress();
        if (lan) return lan;
    }

    // As a last resort (e.g. unusual network setups), fall back to host.docker.internal when running in Docker
    if (isDockerContainer()) {
        return 'host.docker.internal';
    }

    return null;
}

/**
 * Convert a URL from localhost/127.0.0.1 to LAN IP address
 * @param {string} url - The URL to convert
 * @param {string} lanIp - The LAN IP address to use (optional, will be auto-detected if not provided)
 * @returns {string} Converted URL
 */
function convertToLANUrl(url, lanIp = null) {
    if (!url) return url;
    
    // Use provided IP or auto-detect
    let targetIp = lanIp;
    if (!targetIp) {
        targetIp = getTargetIP();
    }
    
    if (!targetIp) {
        // No LAN IP found, return original URL
        return url;
    }
    
    // Replace localhost, 127.0.0.1, and Docker DNS names with target IP
    let converted = url;
    
    // Replace localhost / loopback
    converted = converted.replace(/localhost(?=[:/]|$)/gi, targetIp);
    converted = converted.replace(/127\.0\.0\.1(?=[:/]|$)/g, targetIp);

    // Replace Docker internal DNS names.
    // IMPORTANT: match whole hostname after "//" (or string start) to avoid turning
    // "host.docker.internal" into "host.host.docker.internal".
    converted = converted.replace(/(^|\/\/)(host\.docker\.internal)(?=[:/]|$)/gi, `$1${targetIp}`);
    converted = converted.replace(/(^|\/\/)(docker\.internal)(?=[:/]|$)/gi, `$1${targetIp}`);
    
    return converted;
}

/**
 * Convert all URLs in an app object to use LAN IP
 * @param {Object} app - App object with url property
 * @param {string} lanIp - LAN IP address (optional)
 * @returns {Object} App object with converted URL
 */
function convertAppUrl(app, lanIp = null) {
    if (!app || !app.url) return app;
    
    return {
        ...app,
        url: convertToLANUrl(app.url, lanIp)
    };
}

/**
 * Convert all URLs in an array of apps
 * @param {Array} apps - Array of app objects
 * @param {string} lanIp - LAN IP address (optional)
 * @returns {Array} Array of apps with converted URLs
 */
function convertAppsUrls(apps, lanIp = null) {
    if (!Array.isArray(apps)) return apps;
    
    const targetIp = lanIp || getLANIpAddress();
    
    return apps.map(app => convertAppUrl(app, targetIp));
}

/**
 * Check if a string is a localhost URL
 * @param {string} url - URL to check
 * @returns {boolean} True if localhost URL
 */
function isLocalhostUrl(url) {
    if (!url) return false;
    
    return url.includes('localhost') || 
           url.includes('127.0.0.1') ||
           url.includes('host.docker.internal') ||
           url.includes('docker.internal');
}

module.exports = {
    getNetworkInterfaces,
    getLANIpAddress,
    getTargetIP,
    convertToLANUrl,
    convertAppUrl,
    convertAppsUrls,
    isLocalhostUrl,
    isDockerContainer
};
