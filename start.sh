#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  TrafficOS — Multi-Robot Traffic Control     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Backend ───────────────────────────────────────
echo "▶ Starting Python backend..."
cd backend

if ! command -v python3 &>/dev/null; then
  echo "❌ Python 3 not found. Install from https://python.org"
  exit 1
fi

pip install -r requirements.txt -q

python3 main.py &
BACK_PID=$!
echo "  Backend running on http://localhost:8000"
echo "  API docs:   http://localhost:8000/docs"

cd ..

sleep 2

# ── Frontend ──────────────────────────────────────
echo ""
echo "▶ Starting React frontend..."
cd frontend

if ! command -v npm &>/dev/null; then
  echo "❌ Node/npm not found. Install from https://nodejs.org"
  kill $BACK_PID
  exit 1
fi

npm install --silent
npm start &
FRONT_PID=$!

echo ""
echo "✅ TrafficOS is running!"
echo ""
echo "   Frontend → http://localhost:3000"
echo "   Backend  → http://localhost:8000"
echo "   API Docs → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services."

trap "echo 'Shutting down...'; kill $BACK_PID $FRONT_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
