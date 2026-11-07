#!/usr/bin/env bash
# Renders the farm at a sweep of times of day into a folder (default /tmp/sky-sweep), for looking at the grade.
# Usage: tools/sky-sweep.sh [out-dir] [weather] [demo]   e.g. tools/sky-sweep.sh /tmp/sweep rain farm
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-/tmp/sky-sweep}"
weather="${2:-sun}"
demo="${3:-farm}"
mkdir -p "$out"
for t in 0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.64 0.7 0.74 0.8 0.9 0.95; do
	xvfb-run -a -s "-screen 0 1280x720x24" ~/godot/godot --path . --rendering-driver opengl3 --resolution 1280x720 -- \
		--demo="$demo" --time="$t" --weather="$weather" --screenshot="$(realpath -m "$out")/$demo-$weather-$t.png" >/dev/null 2>&1 || true
done
echo "pictures in $out"
