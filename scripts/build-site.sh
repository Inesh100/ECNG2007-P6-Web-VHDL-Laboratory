#!/usr/bin/env bash
# Builds the deployable site into ./site
#   /      -> app/  (combined P6 app)
#   /P6B/  -> P6B/  (Run, Results & Waveforms)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf site
(cd app && npm ci && npx tsc -b && npx vite build --base=./)
(cd P6B && npm ci && npm run build)
cp -r app/dist site
cp -r P6B/dist site/P6B
echo "Built ./site"
