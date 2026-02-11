#!/bin/bash

# Backend restart script with process management
# Kills any existing backend, starts fresh, logs to /logs/backend_YYYYMMDD_HHMMSS.log

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/backend_${TIMESTAMP}.log"
PID_FILE="$LOG_DIR/backend.pid"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

echo "📝 Logging to: $LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Backend Restart at $(date)" | tee -a "$LOG_FILE"
echo "Logging to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# Check if backend is already running via PID file
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "Stopping existing backend process (PID: $OLD_PID)..." | tee -a "$LOG_FILE"
        kill "$OLD_PID"
        sleep 2
        # Force kill if still running
        if ps -p "$OLD_PID" > /dev/null 2>&1; then
            echo "Force killing backend process..." | tee -a "$LOG_FILE"
            kill -9 "$OLD_PID"
            sleep 1
        fi
    else
        echo "PID file exists but process not running, cleaning up..." | tee -a "$LOG_FILE"
    fi
    rm -f "$PID_FILE"
fi

# Also check for any processes on port 8000
echo "Checking for any processes on port 8000..." | tee -a "$LOG_FILE"
lsof -ti:8000 | while read pid; do
    echo "Killing process $pid on port 8000..." | tee -a "$LOG_FILE"
    kill "$pid" 2>/dev/null
done
sleep 1

# Activate virtual environment and start backend
echo "Starting backend..." | tee -a "$LOG_FILE"
cd "$PROJECT_ROOT/backend"

# Start backend with nohup for persistence
(
    source venv/bin/activate
    nohup uvicorn app.main:app --reload --port 8000 >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Backend started with PID: $(cat $PID_FILE)" | tee -a "$LOG_FILE"
    echo "Running in nohup mode - will persist after terminal closes" | tee -a "$LOG_FILE"
)

# Wait a moment and verify it started
sleep 3
if [ -f "$PID_FILE" ]; then
    NEW_PID=$(cat "$PID_FILE")
    if ps -p "$NEW_PID" > /dev/null 2>&1; then
        echo "✅ Backend successfully started (PID: $NEW_PID)" | tee -a "$LOG_FILE"
        echo "   Listening on: http://localhost:8000" | tee -a "$LOG_FILE"
        echo "   API Docs: http://localhost:8000/docs" | tee -a "$LOG_FILE"
        echo "   Health: http://localhost:8000/health" | tee -a "$LOG_FILE"
    else
        echo "❌ Backend failed to start! Check log: $LOG_FILE" | tee -a "$LOG_FILE"
        exit 1
    fi
else
    echo "❌ Failed to create PID file!" | tee -a "$LOG_FILE"
    exit 1
fi
