#!/usr/bin/env bash
# Builds the deployable site into ./site
#   /             -> P6A/ (editor + language features; hosts P6B in its Run & Results panel)
#   /P6B/         -> P6B/ (Run, Results & Waveforms)
#   /prototype/   -> app/ (early combined prototype, kept for reference)
# P6A and P6B share one origin, so the IF-P6-WS-01 BroadcastChannel connects them.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf site
(cd P6B && npm ci && npm run build)
(cd P6A && { [ -f package-lock.json ] && npm ci || npm install; } && npm run build)
(cd app && npm ci && npx tsc -b && npx vite build --base=./)
cp -r P6A/dist site
rm -rf site/P6B
cp -r P6B/dist site/P6B
cp -r app/dist site/prototype
echo "Built ./site (P6A at /, P6B at /P6B/, prototype at /prototype/)"
