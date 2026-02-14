const net = require('net');
const config = require('../config.json');

/**
 * Port Scanner Agent
 * Scans a range of ports on localhost to discover web servers
 */
class PortScanner {
    constructor() {
        this.portStart = config.portRange.start;
        this.portEnd = config.portRange.end;
        this.concurrency = config.scanning.concurrency;
        this.timeout = config.scanning.timeoutMs;
        this.discoveredPorts = [];
    }

    /**
     * Check if a single port is open and has an HTTP server
     */
    async checkPort(port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            let status = 'closed';

            socket.setTimeout(this.timeout);

            socket.on('connect', () => {
                status = 'open';
                socket.destroy();
            });

            socket.on('timeout', () => {
                status = 'timeout';
                socket.destroy();
            });

            socket.on('error', () => {
                status = 'closed';
            });

            socket.on('close', () => {
                resolve({ port, status });
            });

            socket.connect(port, '127.0.0.1');
        });
    }

    /**
     * Check if an open port has an HTTP/HTTPS server
     */
    async checkHttpServer(port) {
        const protocols = ['http', 'https'];
        
        for (const protocol of protocols) {
            try {
                const axios = require('axios');
                const url = `${protocol}://127.0.0.1:${port}`;
                
                const response = await axios.get(url, {
                    timeout: this.timeout,
                    validateStatus: () => true, // Accept all status codes
                    maxRedirects: 5
                });

                if (response.status >= 100 && response.status < 600) {
                    return {
                        port,
                        protocol,
                        url,
                        status: 'online',
                        statusCode: response.status,
                        title: this.extractTitle(response.data)
                    };
                }
            } catch (error) {
                // Try next protocol
                continue;
            }
        }

        return null;
    }

    /**
     * Extract title from HTML response
     */
    extractTitle(html) {
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match ? match[1].trim() : null;
    }

    /**
     * Scan a batch of ports concurrently
     */
    async scanBatch(ports) {
        const results = await Promise.all(
            ports.map(port => this.checkPort(port))
        );

        // Filter only open ports and check for HTTP servers
        const openPorts = results.filter(r => r.status === 'open');
        const httpServers = [];

        for (const result of openPorts) {
            const httpResult = await this.checkHttpServer(result.port);
            if (httpResult) {
                httpServers.push(httpResult);
            }
        }

        return httpServers;
    }

    /**
     * Main scan method - scans all ports in configured range
     */
    async scan() {
        console.log(`[PortScanner] Starting scan of ports ${this.portStart}-${this.portEnd}...`);
        const startTime = Date.now();
        
        const allPorts = [];
        for (let port = this.portStart; port <= this.portEnd; port++) {
            allPorts.push(port);
        }

        // Split into batches for concurrency control
        const batches = [];
        for (let i = 0; i < allPorts.length; i += this.concurrency) {
            batches.push(allPorts.slice(i, i + this.concurrency));
        }

        const discoveredServers = [];

        for (const batch of batches) {
            const servers = await this.scanBatch(batch);
            discoveredServers.push(...servers);
            
            // Progress indicator
            const progress = Math.round((batch[0] / allPorts.length) * 100);
            process.stdout.write(`\r[PortScanner] Progress: ${progress}%`);
        }

        console.log(`\n[PortScanner] Scan complete. Found ${discoveredServers.length} web servers in ${Date.now() - startTime}ms`);

        return discoveredServers;
    }

    /**
     * Quick scan - scan common ports only (for faster initial discovery)
     */
    async quickScan() {
        const commonPorts = [
            80, 443, 8080, 3000, 5000, 8000, 8443, 8888, 9000, 9200,
            10000, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032,
            1080, 3001, 4000, 5001, 5500, 5601, 6000, 6379, 7001, 8001,
            8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010, 8020,
            8030, 8040, 8050, 8060, 8070, 8081, 8082, 8083, 8084, 8085,
            8086, 8087, 8089, 8090, 8091, 8100, 8200, 8300, 8400, 8500,
            8600, 8700, 8800, 9001, 9002, 9003, 9004, 9005, 9006, 9007,
            9008, 9009, 9010, 9020, 9030, 9040, 9050, 9060, 9100, 9201,
            9300, 9400, 9500, 9600, 9700, 9800, 9900, 10001, 10002, 10003,
            11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000
        ];

        console.log(`[PortScanner] Quick scan of ${commonPorts.length} common ports...`);
        const startTime = Date.now();
        
        const servers = await this.scanBatch(commonPorts);
        
        console.log(`[PortScanner] Quick scan complete. Found ${servers.length} web servers in ${Date.now() - startTime}ms`);
        
        return servers;
    }
}

module.exports = PortScanner;