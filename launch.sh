#!/usr/bin/env bash
# launch.sh -- Context Engine launcher for macOS/Linux

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=3847

echo ""
echo "  Context Engine"
echo "  =============="

# Check if already running
if lsof -i :$PORT >/dev/null 2>&1; then
    echo "  Server already running on port $PORT."
    echo "  Opening browser..."
    if command -v xdg-open &>/dev/null; then xdg-open "http://localhost:$PORT"
    elif command -v open &>/dev/null; then open "http://localhost:$PORT"
    fi
    exit 0
fi

echo "  Starting server..."
cd "$SCRIPT_DIR/server"
node server.js &
sleep 2

if command -v xdg-open &>/dev/null; then xdg-open "http://localhost:$PORT"
elif command -v open &>/dev/null; then open "http://localhost:$PORT"
else echo "  Open http://localhost:$PORT in your browser."
fi

echo "  Server running. Press Ctrl+C to stop."
wait
