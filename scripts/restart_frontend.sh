#!/bin/bash

# Frontend restart script with process management
# Kills any existing frontend, starts fresh, logs to /logs/frontend_YYYYMMDD_HHMMSS.log

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/frontend_${TIMESTAMP}.log"
PID_FILE="$LOG_DIR/frontend.pid"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

echo "📝 Logging to: $LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Frontend Restart at $(date)" | tee -a "$LOG_FILE"
echo "Logging to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# Check if frontend is already running via PID file
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "Stopping existing frontend process (PID: $OLD_PID)..." | tee -a "$LOG_FILE"
        kill "$OLD_PID"
        sleep 2
        # Force kill if still running
        if ps -p "$OLD_PID" > /dev/null 2>&1; then
            echo "Force killing frontend process..." | tee -a "$LOG_FILE"
            kill -9 "$OLD_PID"
            sleep 1
        fi
    else
        echo "PID file exists but process not running, cleaning up..." | tee -a "$LOG_FILE"
    fi
    rm -f "$PID_FILE"
fi

# Also check for any processes on port 3000
echo "Checking for any processes on port 3000..." | tee -a "$LOG_FILE"
lsof -ti:3000 | while read pid; do
    echo "Killing process $pid on port 3000..." | tee -a "$LOG_FILE"
    kill "$pid" 2>/dev/null
done
sleep 1

# Start frontend
echo "Starting frontend..." | tee -a "$LOG_FILE"
cd "$PROJECT_ROOT/web"

# Start frontend with nohup for persistence
(
    nohup npm run dev >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Frontend started with PID: $(cat $PID_FILE)" | tee -a "$LOG_FILE"
    echo "Running in nohup mode - will persist after terminal closes" | tee -a "$LOG_FILE"
)

# Wait a moment and verify it started
sleep 5
if [ -f "$PID_FILE" ]; then
    NEW_PID=$(cat "$PID_FILE")
    if ps -p "$NEW_PID" > /dev/null 2>&1; then
        echo "✅ Frontend successfully started (PID: $NEW_PID)" | tee -a "$LOG_FILE"
        echo "   Home: http://localhost:3000" | tee -a "$LOG_FILE"
        echo "   Login: http://localhost:3000/login" | tee -a "$LOG_FILE"
    else
        echo "❌ Frontend failed to start! Check log: $LOG_FILE" | tee -a "$LOG_FILE"
        exit 1
    fi
else
    echo "❌ Failed to create PID file!" | tee -a "$LOG_FILE"
    exit 1
fi
