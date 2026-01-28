#!/usr/bin/env node
const { spawn } = require('child_process');

// Start backend on port 3001
const backend = spawn('node', ['server.js'], { cwd: '/opt/nginx-gui', env: { ...process.env, PORT: '3001' } });
backend.stdout.on('data', (d) => console.log('[backend]', d.toString().trim()));
backend.stderr.on('data', (d) => console.error('[backend]', d.toString().trim()));

// Wait a moment then start Next.js
setTimeout(() => {
  const nextjs = spawn('node_modules/.bin/next', ['start', '--port', '3000'], { cwd: '/opt/nginx-gui' });
  nextjs.stdout.on('data', (d) => console.log('[nextjs]', d.toString().trim()));
  nextjs.stderr.on('data', (d) => console.error('[nextjs]', d.toString().trim()));
}, 1000);

process.on('SIGTERM', () => {
  backend.kill();
  setTimeout(() => process.exit(0), 2000);
});
