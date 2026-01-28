#!/usr/bin/env node
/**
 * Production server: Express API backend + Next.js standalone frontend
 * Runs Express on the main port, proxies non-/api routes through to Next.js
 */
const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const NEXT_PORT = 3001;

// Start Next.js standalone server in background on port 3001
const nextServer = spawn('node', ['./.next/standalone/server.js'], {
  cwd: __dirname,
  env: {
    ...process.env,
    PORT: NEXT_PORT,
    HOSTNAME: '127.0.0.1'
  },
  stdio: 'inherit'
});

nextServer.on('error', (err) => {
  console.error('Failed to start Next.js:', err);
  process.exit(1);
});

// Wait a moment for Next.js to start, then start Express
setTimeout(() => {
  // Create Express app
  const app = express();
  const apiApp = require('./server-backend');
  
  // Create proxy to Next.js
  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${NEXT_PORT}`,
    changeOrigin: true
  });
  
  // Route /api directly to apiApp (don't use app.use('/api') as it strips the /api prefix)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return apiApp(req, res);
    }
    next();
  });
  
  // Route everything else to Next.js via proxy
  app.use((req, res) => {
    proxy.web(req, res, (err) => {
      if (err) {
        console.error('Proxy error:', err);
        res.status(502).send('Bad Gateway');
      }
    });
  });
  
  // Start Express server on main port
  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[${new Date().toISOString()}] nginx-gui (Express + Next.js) listening on http://0.0.0.0:${PORT}`);
  });
  
  // Handle shutdown
  process.on('SIGTERM', () => {
    console.log('[SIGTERM] Shutting down...');
    server.close();
    nextServer.kill();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('[SIGINT] Shutting down...');
    server.close();
    nextServer.kill();
    process.exit(0);
  });
}, 2000);

