const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const app = express();
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.FRONTEND_PORT || process.env.PORT || 3000);
const backendScheme = process.env.BACKEND_SCHEME || 'http';
const backendHost = process.env.BACKEND_HOST || 'localhost';
const backendPort = Number(process.env.BACKEND_PORT || 5000);
const backendOrigin = `${backendScheme}://${backendHost}:${backendPort}`;
const buildDir = path.join(__dirname, 'build');
const indexFile = path.join(buildDir, 'index.html');

if (!fs.existsSync(indexFile)) {
  console.error('Frontend build output was not found. Run `npm run build` or start with FRONTEND_BUILD_ON_START=1.');
  process.exit(1);
}

app.disable('x-powered-by');

app.use('/api', (request, response) => {
  const transport = backendScheme === 'https' ? https : http;
  const proxyRequest = transport.request(
    {
      protocol: `${backendScheme}:`,
      hostname: backendHost,
      port: backendPort,
      method: request.method,
      path: request.originalUrl,
      headers: {
        ...request.headers,
        host: `${backendHost}:${backendPort}`,
        'x-forwarded-host': request.headers.host || '',
        'x-forwarded-proto': request.protocol,
      },
    },
    (proxyResponse) => {
      response.status(proxyResponse.statusCode || 502);
      Object.entries(proxyResponse.headers).forEach(([headerName, headerValue]) => {
        if (headerValue !== undefined) {
          response.setHeader(headerName, headerValue);
        }
      });
      proxyResponse.pipe(response);
    }
  );

  proxyRequest.on('error', (error) => {
    console.error(`API proxy error for ${request.method} ${request.originalUrl}:`, error.message);
    if (!response.headersSent) {
      response.status(502).json({
        error: {
          code: 'FRONTEND_PROXY_ERROR',
          message: 'Unable to reach the backend service from the frontend server.',
          details: { target: backendOrigin },
        },
      });
    } else {
      response.end();
    }
  });

  request.pipe(proxyRequest);
});

app.use(express.static(buildDir));

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('*', (_request, response) => {
  response.sendFile(indexFile);
});

app.listen(port, host, () => {
  console.log(`Frontend server listening on http://${host}:${port} and proxying /api to ${backendOrigin}`);
});
