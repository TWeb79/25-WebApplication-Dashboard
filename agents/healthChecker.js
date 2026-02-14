const axios = require('axios');
const config = require('../config.json');

// Detect if running in Docker
const isDocker = process.env.DOCKER_CONTAINER || false;

// Common non-HTTP ports that should be marked as unknown
const NON_HTTP_PORTS = [
    // Databases
    3306, 5432, 27017, 6379, 11211, 9042, 7000, 7001, 5000, 8888,
    // Message brokers
    5672, 1883, 8080, 61613, 61614,
    // FTP/SSH
    21, 22, 23,
    // Mail
    25, 110, 143, 465, 587, 993, 995,
    // Other services
    2049, 445, 139, 138, 137, 161, 162, 514, 515
];

// Get the correct host for health checks
const getHealthCheckHost = (url) => {
    // Check config for target host
    const targetHost = config.targetHost || 'localhost';
    
    // If targetHost is explicitly set to a non-localhost value, use it
    if (targetHost !== 'localhost' && targetHost !== '127.0.0.1') {
        return url.replace(/localhost|127\.0\.0\.1/g, targetHost);
    }
    
    // Otherwise check if we're in Docker
    if (isDocker) {
        return url.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
    }
    return url;
};

// Check if port is likely a non-HTTP service
const isNonHttpPort = (port) => {
    return NON_HTTP_PORTS.includes(parseInt(port));
};

/**
 * Health Checker Agent
 * Monitors the status of discovered web applications
 */
class HealthChecker {
    constructor() {
        this.timeout = config.scanning.timeoutMs;
    }

    /**
     * Check if a URL is responding
     */
    async check(url) {
        // Use correct host for Docker
        const checkUrl = getHealthCheckHost(url);
        
        const startTime = Date.now();
        let status = 'unknown';
        let statusCode = null;
        let responseTime = null;
        let title = null;
        let redirectUrl = null;
        let isHttpResponse = true;
        
        // Extract port from URL
        let port;
        try {
            port = new URL(checkUrl).port;
        } catch (e) {
            port = 80;
        }

        try {
            const response = await axios.get(checkUrl, {
                timeout: this.timeout,
                validateStatus: () => true,
                maxRedirects: 5,
                headers: {
                    'User-Agent': 'LocalWebAppMonitor/1.0'
                }
            });

            responseTime = Date.now() - startTime;
            statusCode = response.status;

            // Determine status based on response code
            if (response.status >= 200 && response.status < 400) {
                status = 'online';
            } else if (response.status >= 400 && response.status < 500) {
                status = 'online'; // Client error, but server is responding
            } else if (response.status >= 500) {
                status = 'online'; // Server error, but responding
            }

            // Track redirects
            if (response.request?.res?.responseUrl) {
                redirectUrl = response.request.res.responseUrl;
            }

            // Extract title from HTML
            if (response.headers['content-type']?.includes('text/html')) {
                title = this.extractTitle(response.data);
            }

        } catch (error) {
            responseTime = Date.now() - startTime;
            
            if (error.code === 'ECONNREFUSED') {
                status = 'offline';
                isHttpResponse = false;
            } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                status = 'offline';
                isHttpResponse = false;
            } else if (error.response) {
                // Server responded with error
                status = 'online';
                statusCode = error.response.status;
            } else {
                // Check if it's likely a non-HTTP port
                if (isNonHttpPort(port)) {
                    status = 'unknown';
                    isHttpResponse = false;
                } else {
                    status = 'offline';
                }
            }
        }

        return {
            url,
            status,
            statusCode,
            responseTime,
            title,
            redirectUrl,
            isHttpResponse,
            checkedAt: new Date().toISOString()
        };
    }

    /**
     * Extract title from HTML content
     */
    extractTitle(html) {
        if (!html || typeof html !== 'string') return null;
        
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match ? match[1].trim() : null;
    }

    /**
     * Check multiple URLs in batch
     */
    async checkBatch(urls) {
        const results = await Promise.all(
            urls.map(url => this.check(url))
        );
        return results;
    }

    /**
     * Check all apps in database
     */
    async checkAll(apps) {
        const urls = apps.map(app => app.url);
        const results = await this.checkBatch(urls);
        return results;
    }
}

module.exports = HealthChecker;