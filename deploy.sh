#!/bin/bash
# Quick deployment script for nginx-gui Next.js version

set -e

REMOTE="root@10.0.0.163"
REMOTE_PATH="/opt/nginx-gui"

echo "Deploying nginx-gui (Next.js) to $REMOTE:$REMOTE_PATH"

# Copy source files
echo "Copying files..."
scp -r package.json server.js next.config.js public/ app/ configs/ "$REMOTE:$REMOTE_PATH/"

echo "Installing deps and building..."
ssh "$REMOTE" "cd $REMOTE_PATH && npm install && npm run build"

echo "Restarting service..."
ssh "$REMOTE" "systemctl restart nginx-gui"

echo "Deployment complete!"
ssh "$REMOTE" "systemctl status nginx-gui --no-pager"
