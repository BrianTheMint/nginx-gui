#!/usr/bin/env node
const app = require('./server-backend');
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Serve static files from public folder (vanilla JS frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: serve index.html for client-side routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] nginx-gui listening on http://0.0.0.0:${PORT}`);
  console.log(`API: http://0.0.0.0:${PORT}/api/files`);
  console.log(`Frontend: http://0.0.0.0:${PORT}/`);
});

