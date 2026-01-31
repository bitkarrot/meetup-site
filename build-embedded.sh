#!/bin/bash
set -e

echo "Building Nostr-CMS for embedded deployment..."

# Install dependencies
npm ci --silent

# Build with production mode
npm run build

# Generate runtime config stub
cat > dist/config-runtime.js << 'EOF'
// Runtime configuration will be injected by Go server
window.__RUNTIME_CONFIG__ = {
  defaultRelay: window.__FRONTEND_CONFIG__?.defaultRelay || '',
  remoteNostrJsonUrl: window.__FRONTEND_CONFIG__?.remoteNostrJsonUrl || '',
  masterPubkey: window.__FRONTEND_CONFIG__?.masterPubkey || ''
};
EOF

# Check if OS is macOS (Darwin) or Linux for sed command
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i.tmp 's|<head>|<head><script src="/config-runtime.js"></script>|' dist/index.html
  rm -f dist/index.html.tmp
else
  # Linux
  sed -i 's|<head>|<head><script src="/config-runtime.js"></script>|' dist/index.html
fi

# Copy 404 handler for SPA routing
cp dist/index.html dist/404.html

echo "Frontend built successfully for embedding!"
echo "Output: dist/"
