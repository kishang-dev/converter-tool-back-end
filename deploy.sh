#!/bin/bash

# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh  —  Sync converter-tool backend to AWS EC2 and restart server
# Usage: bash deploy.sh
# Run this from the converter-tool-back-end directory on your LOCAL machine
# ─────────────────────────────────────────────────────────────────────────────

KEY="allinconverter-key.pem"
HOST="ubuntu@51.20.8.165"
REMOTE_DIR="~/converter-tool-back-end"
LOCAL_DIR="$(pwd)"

echo ""
echo "🚀 Deploying converter-tool backend to AWS..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Look for the PEM key in common locations ───────────────────────────────
KEY_PATH=""
for loc in "$HOME/downloads/$KEY" "$HOME/$KEY" "./$KEY" "$HOME/Desktop/$KEY"; do
  if [ -f "$loc" ]; then
    KEY_PATH="$loc"
    break
  fi
done

if [ -z "$KEY_PATH" ]; then
  echo "❌ PEM key '$KEY' not found."
  echo "   Please place '$KEY' in your Downloads folder and re-run."
  exit 1
fi

echo "✅ Found PEM key at: $KEY_PATH"
chmod 400 "$KEY_PATH"

# ── 2. Upload core files ──────────────────────────────────────────────────────
echo ""
echo "📤 Uploading server.js..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/server.js" \
  "$HOST:$REMOTE_DIR/server.js"

echo "📤 Uploading package.json..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/package.json" \
  "$HOST:$REMOTE_DIR/package.json"

echo "Uploading package-lock.json and Puppeteer config..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/package-lock.json" \
  "$HOST:$REMOTE_DIR/package-lock.json"

scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/.puppeteerrc.cjs" \
  "$HOST:$REMOTE_DIR/.puppeteerrc.cjs"

# ── 3. Upload all routes ──────────────────────────────────────────────────────
echo ""
echo "📤 Uploading routes/..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/routes/"*.js \
  "$HOST:$REMOTE_DIR/routes/"

# ── 4. Upload all controllers ─────────────────────────────────────────────────
echo ""
echo "📤 Uploading controllers/..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/controllers/"*.js \
  "$HOST:$REMOTE_DIR/controllers/"

# ── 5. Upload config & middleware ─────────────────────────────────────────────
echo ""
echo "📤 Uploading config/ and middleware/..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/config/"*.js \
  "$HOST:$REMOTE_DIR/config/" 2>/dev/null

scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/middleware/"*.js \
  "$HOST:$REMOTE_DIR/middleware/" 2>/dev/null

# ── 6. Upload models ──────────────────────────────────────────────────────────
echo ""
echo "📤 Uploading models/..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/models/"*.js \
  "$HOST:$REMOTE_DIR/models/" 2>/dev/null

# ── 7. Upload utils ───────────────────────────────────────────────────────────
echo ""
echo "📤 Uploading utils/..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/utils/"*.js \
  "$HOST:$REMOTE_DIR/utils/" 2>/dev/null

# ── 8. Run npm install and restart on AWS ─────────────────────────────────────
echo ""
echo "🔧 Running npm install and restarting server on AWS..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$HOST" << 'ENDSSH'
  cd ~/converter-tool-back-end

  echo "📦 Installing dependencies..."
  npm install --omit=dev
  echo "Installing Chrome for PDF previews..."
  npx puppeteer browsers install chrome

  echo "🔄 Restarting server..."
  # Kill any existing node/nodemon process on port 5000
  pkill -f "nodemon server.js" 2>/dev/null || true
  pkill -f "node server.js" 2>/dev/null || true
  sleep 1

  # Start fresh with nohup so it keeps running after SSH disconnects
  nohup npm run dev > ~/server.log 2>&1 &
  sleep 3

  echo ""
  echo "✅ Server restarted! Last log lines:"
  tail -10 ~/server.log
ENDSSH

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment complete!"
echo "   Backend URL: http://51.20.8.165:5000"
echo "   Health check: http://51.20.8.165:5000/health"
echo ""
echo "   Test in Postman: POST http://51.20.8.165:5000/api/auth/register"
