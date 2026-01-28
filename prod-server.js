#!/usr/bin/env node
const express = require('express');
const path = require('path');

// Load backend server
const createBackend = require('./server-backend');
const app = createBackend();

// Serve Next.js static build
const nextPublicPath = path.join(__dirname, '.next/static');
app.use('/_next/static', express.static(nextPublicPath));

// Serve next app via handler if built
try {
  const { requestHandler } = require('./next-server');
  app.use(requestHandler);
} catch (e) {
  console.log('Next.js build not found, running dev mode only');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`nginx-gui running on http://localhost:${PORT}`);
});
