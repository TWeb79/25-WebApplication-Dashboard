const puppeteer = require('puppeteer');
const sharp = require('sharp');
const config = require('../config.json');

// Target dimensions for screenshots
const CAPTURE_WIDTH = 800;
const CAPTURE_HEIGHT = 600;
const TARGET_WIDTH = 280;
const TARGET_HEIGHT = 160;

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
        this.dockerMode = config.docker.enabled || process.env.DOCKER_CONTAINER === 'true';
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
        } else if (this.dockerMode) {
            // Launch Chromium in Docker
            this.browser = await puppeteer.launch({
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--window-size=800,600'
                ]
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
     * Process screenshot: resize to target width maintaining aspect ratio, then crop to target height
     */
    async processScreenshot(buffer) {
        try {
            const image = sharp(buffer);
            const metadata = await image.metadata();
            
            // Calculate height to maintain aspect ratio when width is TARGET_WIDTH
            const aspectRatio = metadata.height / metadata.width;
            const resizedHeight = Math.round(TARGET_WIDTH * aspectRatio);
            
            // Resize to target width, maintaining aspect ratio
            let processed = await image
                .resize(TARGET_WIDTH, resizedHeight, {
                    fit: 'fill'
                })
                .toBuffer();
            
            // Crop to target height (from top)
            processed = await sharp(processed)
                .extract({
                    left: 0,
                    top: 0,
                    width: TARGET_WIDTH,
                    height: TARGET_HEIGHT
                })
                .toBuffer();
            
            return processed;
        } catch (error) {
            console.error('[ScreenshotAgent] Error processing screenshot:', error.message);
            return buffer; // Return original if processing fails
        }
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

            // Set viewport to 800x600 for capture
            await page.setViewport({
                width: CAPTURE_WIDTH,
                height: CAPTURE_HEIGHT
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

            // Process screenshot: resize to 280px width, then crop to 160px height
            const processedBuffer = await this.processScreenshot(screenshotBuffer);

            console.log(`[ScreenshotAgent] Captured screenshot for ${url} (${processedBuffer.length} bytes)`);

            return {
                success: true,
                buffer: processedBuffer,
                thumbnail: null, // Thumbnail disabled, using main image
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