#!/usr/bin/env bash
# Every step of the POC, in order. See README.md for what each proves.
#   ./run-all.sh <wildrunner checkout, deps installed> <jackywu.ca checkout> [scratch dir for step 2b]
set -euo pipefail
WR=$(cd "$1" && pwd); JW=$(cd "$2" && pwd); cd "$(dirname "$0")"
pnpm install --frozen-lockfile >/dev/null
echo "── 0. what jackywu.ca's content is made of";            node census.mjs "$JW"
echo "── 1. wildrunner's editor core without Payload/Next";   node build-core.mjs "$WR"; node run-core.mjs "$JW"
echo "── 2. MDX <-> Lexical, full re-serialisation";         node roundtrip.mjs "$JW"
echo "── 3. saving writes only what changed";                node minimal-diff.mjs "$JW"
echo "── 4. GPX processing with no Node APIs";               node gpx-sandbox.mjs "$JW"
echo "── 5. the editor UI in a plain browser";               node build-ui.mjs "$WR"; node mount-ui.mjs "$WR"
if [ -n "${3:-}" ]; then echo "── 2b. jackywu.ca builds from round-tripped MDX"; ./build-diff.sh "$JW" "$3"; fi
