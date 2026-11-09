#!/bin/sh
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
(sleep 2; command -v xdg-open >/dev/null && xdg-open http://localhost:3000 || open http://localhost:3000) >/dev/null 2>&1 &
node server.js
