#!/bin/bash
cd ~/converter-tool-back-end

echo "--- Stashing .env changes ---"
git stash

echo "--- Pulling latest code ---"
git pull origin main

echo "--- Restoring .env ---"
git stash pop

echo "--- Killing old server ---"
pkill -f "node server.js" 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
sleep 2

echo "--- Starting server ---"
nohup npm run dev > ~/server.log 2>&1 &
sleep 5
echo "--- Server log ---"
tail -25 ~/server.log
