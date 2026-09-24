#!/usr/bin/env bash
# Step 2b: the proof that matters — jackywu.ca's own `pnpm build` (Astro + the five
# postbuild checks) on round-tripped MDX, every generated page diffed against a build
# of the untouched content. Works on copies; neither checkout is modified.
#   ./build-diff.sh <jackywu.ca checkout> <scratch dir>
set -euo pipefail
JW=$(cd "$1" && pwd); OUT=$2; HERE=$(cd "$(dirname "$0")" && pwd)
PNPM="npx -y pnpm@$(node -p "require('$JW/package.json').packageManager.split('@')[1]")"
rm -rf "$OUT/base" "$OUT/rt"; mkdir -p "$OUT"
cp -a "$JW" "$OUT/base"; rm -rf "$OUT/base/.git" "$OUT/base/dist"
(cd "$OUT/base" && $PNPM install --frozen-lockfile >/dev/null && $PNPM build > "$OUT/base.log" 2>&1)
cp -a "$OUT/base" "$OUT/rt"; rm -rf "$OUT/rt/dist"
node "$HERE/roundtrip.mjs" "$JW" --write "$OUT/rt" | head -1
(cd "$OUT/rt" && $PNPM build > "$OUT/rt.log" 2>&1) && echo "round-tripped build incl. 5 postbuild checks: passed" || { echo "round-tripped build FAILED, see $OUT/rt.log"; exit 1; }
n=0; d=0
for f in $(cd "$OUT/base/dist" && find . -name '*.html' | sort); do
  n=$((n+1)); cmp -s "$OUT/base/dist/$f" "$OUT/rt/dist/$f" || { d=$((d+1)); echo "  differs: $f"; }
done
echo "generated pages: $n, byte-identical: $((n-d)), differing: $d"
