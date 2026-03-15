const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.FRONTEND_PORT || process.env.PORT || 3000);
const buildDir = path.join(__dirname, 'build');
const indexFile = path.join(buildDir, 'index.html');

if (!fs.existsSync(indexFile)) {
  console.error('Frontend build output was not found. Run `npm run build` or start with FRONTEND_BUILD_ON_START=1.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.static(buildDir));

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('*', (_request, response) => {
  response.sendFile(indexFile);
});

app.listen(port, host, () => {
  console.log(`Frontend server listening on http://${host}:${port}`);
});
