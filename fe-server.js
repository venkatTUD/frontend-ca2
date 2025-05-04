const http = require('http');
const url = require('url');
const { parse } = require('querystring');
const fs = require('fs');

// Load configuration from environment variables
const config = {
    webservice_host: process.env.WEBSERVICE_HOST || 'receipt-backend-service.default.svc.cluster.local',
    webservice_port: process.env.WEBSERVICE_PORT || '80',
    exposedPort: process.env.EXPOSED_PORT || '22137',
    app_name: 'Recipe Tracker'
};
global.gConfig = config;

console.log('Using configuration to connect to backend');
console.log('webservice_host:', config.webservice_host);
console.log('webservice_port:', config.webservice_port);

// Add startup confirmation
console.log(`Starting server on port ${global.gConfig.exposedPort}`);
console.log(`Will connect to backend at ${global.gConfig.webservice_host}:${global.gConfig.webservice_port}`);

// Load CSS (create if not exists)
const css = fs.existsSync('./public/default.css') ? fs.readFileSync('./public/default.css', 'utf8') : 'body { font-family: Arial; }';

// HTML templates
const header = '<!doctype html><html><head><style>' + css + '</style></head>';
const startBody = '<body><div id="container"><div id="logo">' + global.gConfig.app_name + '</div><div id="space"></div>';
const form = '<div id="form"><form id="form" action="/" method="post"><center>' +
    '<label class="control-label">Name:</label><input class="input" type="text" name="name"/><br />' +
    '<label class="control-label">Ingredients:</label><input class="input" type="text" name="ingredients" /><br />' +
    '<label class="control-label">Prep Time:</label><input class="input" type="number" name="prepTimeInMinutes" /><br />' +
    '<button class="button button1">Submit</button></div></form>';
const startTable = '<div id="space"></div><div id="logo">Your Previous Recipes</div><div id="space"></div>' +
    '<div id="results">Name | Ingredients | PrepTime<div id="space"></div>';
const endTable = '</div>';
const endBody = '</div></body></html>';

// Health metrics
let frontendUp = 1; // 1 = up, 0 = down
let apiUp = 1; // 1 = up, 0 = down for /recipes
const envLabel = process.env.ENV_LABEL || 'unknown'; // Set in deployment YAML (blue or green)

// Helper function to forward requests to backend
const forwardToBackend = (path, method, data = null) => {
    path = path.replace('/api/v1', '');
    return new Promise((resolve, reject) => {
        const options = {
            hostname: global.gConfig.webservice_host,
            port: global.gConfig.webservice_port,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const backendReq = http.request(options, (backendRes) => {
            let responseData = '';

            backendRes.on('data', (chunk) => {
                responseData += chunk;
            });

            backendRes.on('end', () => {
                console.log(`Backend response (${method} ${path}):`, responseData);
                try {
                    if (backendRes.statusCode >= 200 && backendRes.statusCode < 300) {
                        apiUp = 1;
                    } else {
                        apiUp = 0;
                    }
                    resolve({
                        statusCode: backendRes.statusCode,
                        data: responseData ? JSON.parse(responseData) : null
                    });
                } catch (err) {
                    console.error('Error parsing backend response:', err);
                    apiUp = 0;
                    reject(err);
                }
            });
        });

        backendReq.on('error', (error) => {
            console.error(`Backend error (${method} ${path}):`, error);
            apiUp = 0;
            reject(error);
        });

        if (data) {
            backendReq.write(JSON.stringify(data));
        }
        backendReq.end();
    });
};

const server = http.createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);

    // Handle favicon requests
    if (req.url === '/favicon.ico') {
        console.log('favicon requested');
        res.writeHead(200, {'Content-Type': 'image/x-icon'});
        res.end();
        return;
    }

    // Handle metrics endpoint for Prometheus
    if (req.url === '/metrics') {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.write(`
# HELP frontend_up Whether the frontend is up (1) or down (0)
# TYPE frontend_up gauge
frontend_up{env="${envLabel}"} ${frontendUp}
# HELP api_up Whether the backend API is up (1) or down (0)
# TYPE api_up gauge
api_up{env="${envLabel}"} ${apiUp}
        `);
        res.end();
        return;
    }

    try {
        // Handle GET requests
        if (req.method === 'GET') {
            if (req.url === '/' || req.url === '/recipes') {
                const response = await forwardToBackend('/recipes', 'GET');
                let tableContent = '';
                
                if (response.data && Array.isArray(response.data)) {
                    for (const recipe of response.data) {
                        tableContent += `${recipe.name} | ${recipe.ingredients.join(', ')} | ${recipe.prepTimeInMinutes}`;
                        tableContent += '<div id="space"></div>';
                    }
                }

                res.writeHead(200, {'Content-Type': 'text/html'});
                frontendUp = 1;
                res.write(header + startBody + form + startTable + tableContent + endTable + endBody);
                res.end();
            }
            // Forward other GET requests to backend
            else if (req.url.startsWith('/api/v1/')) {
                const response = await forwardToBackend(req.url, 'GET');
                res.writeHead(response.statusCode, {'Content-Type': 'application/json'});
                res.write(JSON.stringify(response.data));
                res.end();
            }
        }
        // Handle POST requests
        else if (req.method === 'POST') {
            if (req.url === '/' || req.url === '/recipes') {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });

                req.on('end', async () => {
                    try {
                        const post = parse(body);
                        const recipeData = {
                            name: post.name,
                            ingredients: post.ingredients.split(',').map(i => i.trim()),
                            prepTimeInMinutes: parseInt(post.prepTimeInMinutes)
                        };

                        await forwardToBackend('/recipe', 'POST', recipeData);
                        
                        res.writeHead(302, { Location: '/' });
                        res.end();
                    } catch (error) {
                        console.error('Error creating recipe:', error);
                        res.writeHead(500, {'Content-Type': 'text/html'});
                        res.write(header + startBody + 'Error creating recipe: ' + error.message + endBody);
                        res.end();
                    }
                });
            }
            // Forward other POST requests to backend
            else if (req.url.startsWith('/api/v1/')) {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });

                req.on('end', async () => {
                    try {
                        const data = body ? JSON.parse(body) : null;
                        const response = await forwardToBackend(req.url, 'POST', data);
                        res.writeHead(response.statusCode, {'Content-Type': 'application/json'});
                        res.write(JSON.stringify(response.data));
                        res.end();
                    } catch (error) {
                        res.writeHead(500, {'Content-Type': 'application/json'});
                        res.write(JSON.stringify({ error: error.message }));
                        res.end();
                    }
                });
            }
        }
    } catch (error) {
        console.error('Server error:', error);
        frontendUp = 0;
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.write(header + startBody + 'Internal server error: ' + error.message + endBody);
        res.end();
    }
});

server.listen(global.gConfig.exposedPort, '0.0.0.0', () => {
    console.log(`Server is listening on port ${global.gConfig.exposedPort}`);
});