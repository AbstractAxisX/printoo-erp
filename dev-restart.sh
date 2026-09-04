#!/bin/bash
cd /home/z/my-project
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 2
rm -f dev.log
exec setsid nohup bun run dev:log > /dev/null 2>&1 < /dev/null &
