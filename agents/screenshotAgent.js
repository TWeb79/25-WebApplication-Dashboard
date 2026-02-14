const puppeteer = require('puppeteer');
const config = require('../config.json');

/**
 * Screenshot Agent
 * Uses Puppeteer to capture screenshots of web applications
 */
class ScreenshotAgent {
    constructor() {
        this.width = config.screenshot.width;
        this.height = config.screenshot.height;
        this.quality = config.screenshot.quality;
        this.thumbnails = config.screenshot.thumbnails !== false;
        this.thumbnailWidth = config.screenshot.thumbnailWidth || 120;
        this.thumbnailHeight = config.screenshot.thumbnailHeight || 90;
        this.dockerMode = config.docker.enabled;
        this.chromeWsEndpoint = config.docker.chromeWsEndpoint;
        this.browser = null;
    }

    /**
     * Initialize browser (reuse for performance)
     */
    async initBrowser() {
        if (this.browser) return this.browser;

        if (this.dockerMode && this.chromeWsEndpoint) {
            // Connect to Chrome in Docker
            this.browser = await puppeteer.connect({
                browserWSEndpoint: this.chromeWsEndpoint
            });
        } else {
            // Launch local browser
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--window-size=800,600'
                ]
            });
        }

        return this.browser;
    }

    /**
     * Capture screenshot of a URL
     */
    async captureScreenshot(url, appId) {
        let browser = null;
        let page = null;

        try {
            browser = await this.initBrowser();
            page = await browser.newPage();

            // Set viewport
            await page.setViewport({
                width: this.width,
                height: this.height
            });

            // Navigate to URL with timeout
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 15000
            });

            // Wait a bit for dynamic content
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Capture screenshot as buffer
            const screenshotBuffer = await page.screenshot({
                type: 'png',
                fullPage: false
            });

            // Capture thumbnail if enabled
            let thumbnailBuffer = null;
            if (this.thumbnails) {
                await page.setViewport({
                    width: this.thumbnailWidth,
                    height: this.thumbnailHeight
                });
                thumbnailBuffer = await page.screenshot({
                    type: 'png',
                    fullPage: false
                });
            }

            console.log(`[ScreenshotAgent] Captured screenshot for ${url} (${screenshotBuffer.length} bytes)`);

            return {
                success: true,
                buffer: screenshotBuffer,
                thumbnail: thumbnailBuffer,
                appId
            };

        } catch (error) {
            console.error(`[ScreenshotAgent] Failed to capture ${url}:`, error.message);
            return {
                success: false,
                error: error.message,
                appId
            };
        } finally {
            if (page) await page.close();
            // Keep browser open for reuse
        }
    }

    /**
     * Capture screenshot and return as base64 data URL
     */
    async captureScreenshotBase64(url) {
        const result = await this.captureScreenshot(url, null);
        
        if (result.success && result.buffer) {
            return {
                ...result,
                dataUrl: `data:image/png;base64,${result.buffer.toString('base64')}`
            };
        }
        
        return result;
    }

    /**
     * Capture screenshots for multiple apps
     */
    async captureBatch(urls, appIds) {
        const results = [];
        
        for (let i = 0; i < urls.length; i++) {
            const result = await this.captureScreenshot(urls[i], appIds[i]);
            results.push(result);
            
            // Small delay between captures to avoid overwhelming servers
            if (i < urls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return results;
    }

    /**
     * Close browser when done
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    /**
     * Get page content for AI analysis
     */
    async getPageContent(url) {
        let browser = null;
        let page = null;

        try {
            browser = await this.initBrowser();
            page = await browser.newPage();

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });

            // Get page title and content
            const title = await page.title();
            const content = await page.evaluate(() => {
                return {
                    bodyText: document.body?.innerText?.substring(0, 2000) || '',
                    headings: Array.from(document.querySelectorAll('h1, h2, h3'))
                        .slice(0, 5)
                        .map(h => h.innerText),
                    hasLoginForm: !!document.querySelector('input[type="password"]'),
                    hasAdminPanel: document.body?.innerText?.toLowerCase().includes('admin') || false
                };
            });

            return {
                url,
                title,
                ...content
            };

        } catch (error) {
            console.error(`[ScreenshotAgent] Failed to get content from ${url}:`, error.message);
            return {
                url,
                error: error.message
            };
        } finally {
            if (page) await page.close();
        }
    }
}

module.exports = ScreenshotAgent;