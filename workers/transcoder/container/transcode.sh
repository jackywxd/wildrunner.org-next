#!/bin/sh
# Transcode one video to H.264 1080p and write it back to R2.
#
#   transcode.sh <source-url> <r2-key>
#
# Prints one line of JSON on success:
#   {"ok":true,"key":"...","bytes":N,"width":W,"height":H}
#
# Everything about the shape of this script follows from one fact: Cloudflare
# "does not guarantee that any container instance will run for any set period
# of time". A host restart or a rollout stops it with SIGTERM and SIGKILLs it
# 15 minutes later, and the disk is ephemeral. So:
#
#   - it does NOT trap SIGTERM to save partial work. There is nothing worth
#     saving; a half-encoded file is not a video. It dies, and the lease
#     sweep in the Worker re-queues the job.
#   - it writes to a key derived from the media id, so a retry overwrites its
#     own previous partial object rather than littering the bucket.
#   - it uploads only after ffmpeg exits 0, so a reader never sees a truncated
#     file at the destination key.

set -eu

SRC_URL="$1"
DEST_KEY="$2"

WORK="$(mktemp -d)"
# `trap ... EXIT` and not a SIGTERM handler: this is only about not leaving
# gigabytes behind on a disk we might be reusing, not about graceful shutdown.
trap 'rm -rf "$WORK"' EXIT

IN="$WORK/in"
OUT="$WORK/out.mp4"

# --fail so an HTML error page is never mistaken for a video. --location
# because R2 public URLs can redirect.
curl --fail --silent --show-error --location --output "$IN" "$SRC_URL"

# See PLAN-video-transcode.md for why each flag is here. The two that are
# easy to lose and expensive to lose:
#
#   -movflags +faststart   ffmpeg's own help: "Run a second pass to put the
#                          index (moov atom) at the beginning of the file".
#                          Without it a browser must download the whole file
#                          before it can start playing — one of the three
#                          things this feature exists to fix.
#   -level:v 4.0           mid-range Android hardware decoders commonly stop
#                          at H.264 Level 4.2; 4K High@L5.1 simply fails to
#                          decode on them.
#
# `min(1920,iw)`/`min(1080,ih)` with force_original_aspect_ratio=decrease
# keeps portrait video portrait — the corpus has three 2160x3840 clips that a
# fixed 1920x1080 would squash.
ffmpeg -nostdin -y -threads 0 -i "$IN" \
  -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2" \
  -c:v libx264 -profile:v high -level:v 4.0 -preset medium -crf 21 \
  -maxrate 6M -bufsize 12M -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k -ac 2 \
  -loglevel error \
  "$OUT"

# Only now is the output whole. Uploading earlier would publish a truncated
# file under the key readers are about to be pointed at.
aws s3api put-object \
  --endpoint-url "$R2_S3_ENDPOINT" \
  --bucket "$R2_BUCKET" \
  --key "$DEST_KEY" \
  --body "$OUT" \
  --content-type video/mp4 >/dev/null

BYTES=$(wc -c < "$OUT" | tr -d ' ')
DIMS=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0:nk=1 "$OUT" </dev/null | tr -d '\n' | tr ',' ' ')
WIDTH=$(echo "$DIMS" | cut -d' ' -f1)
HEIGHT=$(echo "$DIMS" | cut -d' ' -f2)

# No timing here on purpose: `date +%s%3N` is GNU syntax and this runs on
# Alpine's busybox date, which I have no way to test against while the Docker
# daemon is down. The Worker brackets the exec() call and knows the duration
# anyway.
printf '{"ok":true,"key":"%s","bytes":%s,"width":%s,"height":%s}\n' \
  "$DEST_KEY" "$BYTES" "$WIDTH" "$HEIGHT"
