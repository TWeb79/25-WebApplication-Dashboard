/**
 * Network Utility Module
 * Provides functions to detect LAN IP addresses and convert localhost URLs
 */

const os = require('os');
const dns = require('dns').promises;

/**
 * Get all network interfaces
 * @returns {Object} Network interfaces
 */
function getNetworkInterfaces() {
    return os.networkInterfaces();
}

/**
 * Find the first LAN IP address that starts with 192.168.x.x
 * @returns {string|null} LAN IP address or null if not found
 */
function getLANIpAddress() {
    const interfaces = getNetworkInterfaces();
    
    // Preferred: 192.168.x.x range
    const preferredPatterns = ['192.168.'];
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.internal || iface.family !== 'IPv4') {
                continue;
            }
            
            const ip = iface.address;
            
            // Check for 192.168.x.x pattern first
            if (ip.startsWith('192.168.')) {
                return ip;
            }
        }
    }
    
    // Fallback: try other common private ranges
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.internal || iface.family !== 'IPv4') {
                continue;
            }
            
            const ip = iface.address;
            
            // Also check 10.x.x.x and 172.16-31.x.x ranges as fallback
            if (ip.startsWith('10.') || (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31)) {
                return ip;
            }
        }
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
    
    const targetIp = lanIp || getLANIpAddress();
    if (!targetIp) {
        // No LAN IP found, return original URL
        return url;
    }
    
    // Replace localhost, 127.0.0.1, and Docker DNS names with LAN IP
    let converted = url;
    
    // Replace localhost
    converted = converted.replace(/localhost(?=[:/]|$)/gi, targetIp);
    
    // Replace 127.0.0.1
    converted = converted.replace(/127\.0\.0\.1(?=[:/]|$)/g, targetIp);
    
    // Replace Docker internal DNS names (host.docker.internal, docker.internal, etc.)
    converted = converted.replace(/host\.docker\.internal(?=[:/]|$)/gi, targetIp);
    converted = converted.replace(/docker\.internal(?=[:/]|$)/gi, targetIp);
    
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
    convertToLANUrl,
    convertAppUrl,
    convertAppsUrls,
    isLocalhostUrl
};
