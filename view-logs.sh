#!/bin/bash

# HomeQuest API Log Viewer
# Interactive log viewing script

echo "🔍 HomeQuest API Log Viewer"
echo "=============================="
echo ""
echo "Select log type to view:"
echo "1) Combined logs (all)"
echo "2) Error logs only"
echo "3) HTTP request logs"
echo "4) Real-time combined logs (tail -f)"
echo "5) Real-time error logs (tail -f)"
echo "6) Blueprint processing logs (grep)"
echo "7) Performance logs (slow requests)"
echo "8) Last 50 lines of all logs"
echo "9) Clear all logs"
echo "0) Exit"
echo ""

read -p "Enter your choice (0-9): " choice

LOG_DIR="./logs"
TODAY=$(date +%Y-%m-%d)

case $choice in
    1)
        echo "📋 Combined Logs:"
        cat "$LOG_DIR/$TODAY-combined.log"
        ;;
    2)
        echo "❌ Error Logs:"
        cat "$LOG_DIR/$TODAY-error.log"
        ;;
    3)
        echo "🌐 HTTP Request Logs:"
        cat "$LOG_DIR/$TODAY-http.log"
        ;;
    4)
        echo "📡 Real-time Combined Logs (Ctrl+C to exit):"
        tail -f "$LOG_DIR/$TODAY-combined.log"
        ;;
    5)
        echo "🚨 Real-time Error Logs (Ctrl+C to exit):"
        tail -f "$LOG_DIR/$TODAY-error.log"
        ;;
    6)
        echo "🏗️ Blueprint Processing Logs:"
        grep "\[BLUEPRINT\]" "$LOG_DIR/$TODAY-combined.log"
        ;;
    7)
        echo "🐌 Performance/Slow Request Logs:"
        grep "\[PERFORMANCE\]" "$LOG_DIR/$TODAY-combined.log"
        ;;
    8)
        echo "📜 Last 50 lines of all logs:"
        echo "--- Combined ---"
        tail -50 "$LOG_DIR/$TODAY-combined.log"
        echo ""
        echo "--- Errors ---"
        tail -50 "$LOG_DIR/$TODAY-error.log"
        echo ""
        echo "--- HTTP ---"
        tail -50 "$LOG_DIR/$TODAY-http.log"
        ;;
    9)
        read -p "Are you sure you want to clear all logs? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            rm -f "$LOG_DIR"/*.log
            echo "✅ Logs cleared"
        else
            echo "❌ Cancelled"
        fi
        ;;
    0)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "Invalid choice. Please run the script again."
        ;;
esac

echo ""
echo "Press Enter to continue..."
read