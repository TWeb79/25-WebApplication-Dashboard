const axios = require('axios');
const config = require('../config.json');

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
        const startTime = Date.now();
        let status = 'unknown';
        let statusCode = null;
        let responseTime = null;
        let title = null;
        let redirectUrl = null;

        try {
            const response = await axios.get(url, {
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
            } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                status = 'offline';
            } else if (error.response) {
                // Server responded with error
                status = 'online';
                statusCode = error.response.status;
            } else {
                status = 'offline';
            }
        }

        return {
            url,
            status,
            statusCode,
            responseTime,
            title,
            redirectUrl,
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