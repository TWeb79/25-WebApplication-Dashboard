const axios = require('axios');
const config = require('../config.json');

/**
 * AI Agent (Ollama)
 * Identifies and names applications using AI
 */
class AIAgent {
    constructor() {
        // Get the correct host for Docker
        const isDocker = process.env.DOCKER_CONTAINER || false;
        let baseUrl = config.ollama.baseUrl || 'http://localhost:11434';
        
        // Replace localhost with docker host if in container
        if (isDocker && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1'))) {
            baseUrl = baseUrl.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
        }
        
        this.baseUrl = baseUrl;
        this.model = config.ollama.model || 'llama3.2';
        this.systemPrompt = `You are a helpful assistant that identifies local web applications.
        Based on the page title, headings, and content, identify what application this is.
        Return ONLY a JSON object with:
        - name: A short, descriptive name for the application (max 50 chars)
        - category: One of: Development, Database, API, CI/CD, Monitoring, IDE, Other
        - description: A brief description (max 100 chars)

        Examples:
        - "localhost:3000" with React content -> {"name": "React Dev Server", "category": "Development", "description": "React development server"}
        - "localhost:9200" with Elasticsearch content -> {"name": "Elasticsearch", "category": "Database", "description": "Elasticsearch search engine"}
        - "localhost:8080" with Jenkins content -> {"name": "Jenkins", "category": "CI/CD", "description": "Jenkins CI/CD server"}
        - "localhost:5000" with Flask content -> {"name": "Flask App", "category": "Development", "description": "Python Flask application"}`;
    }

    /**
     * Call Ollama API
     */
    async callOllama(prompt) {
        try {
            const response = await axios.post(`${this.baseUrl}/api/generate`, {
                model: this.model,
                prompt: prompt,
                system: this.systemPrompt,
                stream: false,
                format: 'json',
                options: {
                    temperature: 0.1,
                    top_p: 0.9
                }
            }, {
                timeout: 30000
            });

            return response.data;
        } catch (error) {
            console.error(`[AIAgent] Ollama API error:`, error.message);
            return null;
        }
    }

    /**
     * Identify an application from page content
     */
    async identifyApp(url, title, content) {
        const pageInfo = {
            url,
            title: title || 'No title',
            bodyText: (content?.bodyText || '').substring(0, 500),
            headings: (content?.headings || []).join(', ')
        };

        const prompt = `Identify this local web application:
URL: ${pageInfo.url}
Title: ${pageInfo.title}
Headings: ${pageInfo.headings}
Content preview: ${pageInfo.bodyText}

What is this application? Respond with JSON only.`;

        const result = await this.callOllama(prompt);

        if (result && result.response) {
            try {
                // Try to parse the response as JSON
                const parsed = JSON.parse(result.response);
                
                // Validate the response
                return {
                    name: parsed.name || `App on port ${new URL(url).port}`,
                    category: parsed.category || 'Other',
                    description: parsed.description || 'Discovered application'
                };
            } catch (parseError) {
                // Try to extract JSON from response
                const jsonMatch = result.response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        return {
                            name: parsed.name || `App on port ${new URL(url).port}`,
                            category: parsed.category || 'Other',
                            description: parsed.description || 'Discovered application'
                        };
                    } catch (e) {
                        // Fall through to default
                    }
                }
            }
        }

        // Fallback identification based on URL patterns
        return this.fallbackIdentify(url, title);
    }

    /**
     * Fallback identification using URL patterns
     */
    fallbackIdentify(url, title) {
        const hostname = new URL(url).hostname;
        const port = new URL(url).port;
        
        // Common patterns
        const patterns = [
            { pattern: /:3000/, name: 'React/Vue Dev Server', category: 'Development', desc: 'Frontend dev server' },
            { pattern: /:3001/, name: 'Next.js Dev Server', category: 'Development', desc: 'Next.js development server' },
            { pattern: /:5000/, name: 'Flask/Python App', category: 'Development', desc: 'Python web application' },
            { pattern: /:5432/, name: 'PostgreSQL Admin', category: 'Database', desc: 'PostgreSQL database admin' },
            { pattern: /:5433/, name: 'PostgreSQL', category: 'Database', desc: 'PostgreSQL database' },
            { pattern: /:6379/, name: 'Redis', category: 'Database', desc: 'Redis cache server' },
            { pattern: /:8080/, name: 'Tomcat/Java App', category: 'Development', desc: 'Java web application' },
            { pattern: /:8000/, name: 'Python Server', category: 'Development', desc: 'Python development server' },
            { pattern: /:9200/, name: 'Elasticsearch', category: 'Database', desc: 'Elasticsearch search engine' },
            { pattern: /:9300/, name: 'Elasticsearch Cluster', category: 'Database', desc: 'Elasticsearch cluster node' },
            { pattern: /:5601/, name: 'Kibana', category: 'Monitoring', desc: 'Kibana visualization' },
            { pattern: /:4040/, name: 'Jenkins', category: 'CI/CD', desc: 'Jenkins CI/CD server' },
            { pattern: /:9000/, name: 'SonarQube', category: 'CI/CD', desc: 'SonarQube code quality' },
            { pattern: /:9001/, name: 'Portainer', category: 'Monitoring', desc: 'Docker management' },
            { pattern: /:10000/, name: 'Webmin', category: 'Monitoring', desc: 'System administration' },
            { pattern: /:15672/, name: 'RabbitMQ Management', category: 'API', desc: 'RabbitMQ message queue' },
            { pattern: /:15674/, name: 'RabbitMQ', category: 'API', desc: 'RabbitMQ message broker' },
            { pattern: /:8123/, name: 'Prometheus', category: 'Monitoring', desc: 'Prometheus metrics' },
            { pattern: /:9090/, name: 'Prometheus', category: 'Monitoring', desc: 'Prometheus monitoring' },
            { pattern: /:3002/, name: 'Storybook', category: 'Development', desc: 'UI component library' },
            { pattern: /:4200/, name: 'Angular Dev Server', category: 'Development', desc: 'Angular application' },
            { pattern: /:8001/, name: 'API Server', category: 'API', desc: 'Backend API' },
            { pattern: /:8020/, name: 'Hadoop YARN', category: 'Big Data', desc: 'Hadoop resource manager' },
            { pattern: /:50070/, name: 'Hadoop HDFS', category: 'Big Data', desc: 'Hadoop distributed file system' },
            { pattern: /:8081/, name: 'Service', category: 'Development', desc: 'Microservice' },
            { pattern: /:8888/, name: 'Jupyter', category: 'Development', desc: 'Jupyter notebook' },
            { pattern: /:8889/, name: 'Data Service', category: 'API', desc: 'Data service' },
            { pattern: /:9009/, name: 'Angular', category: 'Development', desc: 'Angular application' },
            { pattern: /:9043/, name: 'WebSphere', category: 'Development', desc: 'IBM WebSphere' },
            { pattern: /:9443/, name: 'Admin Console', category: 'Monitoring', desc: 'Administration console' },
            { pattern: /:11434/, name: 'Ollama', category: 'AI/ML', desc: 'Ollama LLM server' },
            { pattern: /:11435/, name: 'Open WebUI', category: 'AI/ML', desc: 'Open WebUI for Ollama' },
        ];

        for (const p of patterns) {
            if (p.pattern.test(url)) {
                return {
                    name: p.name,
                    category: p.category,
                    description: p.desc
                };
            }
        }

        // Use title if available
        if (title && title.length > 0) {
            return {
                name: title.substring(0, 50),
                category: 'Other',
                description: title.substring(0, 100)
            };
        }

        // Default
        const appName = `Port ${port}`;
        return {
            name: appName,
            category: 'Unknown',
            description: `Application on port ${port}`
        };
    }

    /**
     * Identify multiple apps in batch
     */
    async identifyBatch(apps) {
        const results = [];
        
        for (const app of apps) {
            console.log(`[AIAgent] Identifying ${app.url}...`);
            const identification = await this.identifyApp(app.url, app.title, app.content);
            results.push({
                ...app,
                ...identification
            });
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        return results;
    }

    /**
     * Check if Ollama is available
     */
    async isAvailable() {
        try {
            await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
            return true;
        } catch (error) {
            console.log('[AIAgent] Ollama not available - using fallback identification');
            return false;
        }
    }

    /**
     * Get available models
     */
    async getModels() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
            return response.data.models || [];
        } catch (error) {
            return [];
        }
    }
}

module.exports = AIAgent;