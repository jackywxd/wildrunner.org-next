#!/bin/sh
# Transcode one video to H.264 1080p and write it back to R2, and grab a
# poster frame from it on the way past.
#
#   transcode.sh <source-url> <r2-key> <poster-key>
#
# Prints one line of JSON on success:
#   {"ok":true,"key":"...","bytes":N,"width":W,"height":H,
#    "posterKey":"...","posterWidth":W,"posterHeight":H}
#
# THE POSTER IS EXTRACTED BEFORE THE SKIP DECISION, and that placement is the
# whole design rather than an implementation detail. Most of the corpus is
# already h264/<=1080/yuv420p, so most runs take the skip path below and
# encode nothing — measured on the local corpus, 22 of 22 videos had never
# been transcoded at all. A poster step that lived with the encode would
# therefore never run for the videos that most need one, and /gallery would
# keep drawing its dark placeholder card forever.
#
# It also costs almost nothing here: the source is already on local disk from
# the curl below, so this is one seek and one frame, not another download.
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
# Optional third argument, so a container image that is one deploy ahead of
# the Worker — or behind it — still runs. An empty poster key simply means
# "no poster this time" rather than an unbound-variable death under `set -u`.
POSTER_KEY="${3:-}"

WORK="$(mktemp -d)"
# `trap ... EXIT` and not a SIGTERM handler: this is only about not leaving
# gigabytes behind on a disk we might be reusing, not about graceful shutdown.
trap 'rm -rf "$WORK"' EXIT

IN="$WORK/in"
OUT="$WORK/out.mp4"
POSTER="$WORK/poster.jpg"

# --fail so an HTML error page is never mistaken for a video. --location
# because R2 public URLs can redirect.
curl --fail --silent --show-error --location --output "$IN" "$SRC_URL"

# The poster: one frame, one second in, uploaded as its own object.
#
# NOTHING HERE MAY FAIL THE RUN. The transcode is the job; a poster is an
# improvement to how the video is drawn in a grid. `set -e` is suspended for
# each step and every outcome is checked by hand, so a clip that cannot
# produce a frame still gets transcoded and still reports success — it simply
# comes back with no `posterKey`, and the site keeps drawing the placeholder
# card it draws today.
#
# WHY ONE SECOND. Frame zero is very often black or a fade-in; a second in is
# past that on nearly every real clip. But it is past the END of a clip
# shorter than a second, and ffmpeg then writes no output at all — so a
# missing or empty file falls back to the first frame rather than giving up.
# `-frames:v 1` after the input, `-ss` before it: that order makes the seek an
# input seek, which jumps rather than decoding a second of video to throw it
# away.
POSTER_KEY_OUT=""
POSTER_W=""
POSTER_H=""

if [ -n "$POSTER_KEY" ]; then
  set +e
  ffmpeg -nostdin -y -ss 00:00:01 -i "$IN" -frames:v 1 -q:v 3 \
    -loglevel error "$POSTER" 2>/dev/null
  if [ ! -s "$POSTER" ]; then
    ffmpeg -nostdin -y -i "$IN" -frames:v 1 -q:v 3 \
      -loglevel error "$POSTER" 2>/dev/null
  fi

  if [ -s "$POSTER" ]; then
    POSTER_DIMS=$(ffprobe -v error -select_streams v:0 \
      -show_entries stream=width,height -of csv=p=0:nk=1 "$POSTER" \
      </dev/null | tr -d '\n' | tr ',' ' ')
    POSTER_W=$(echo "$POSTER_DIMS" | cut -d' ' -f1)
    POSTER_H=$(echo "$POSTER_DIMS" | cut -d' ' -f2)

    # Uploaded before the encode rather than after, so a container that is
    # killed mid-encode — which Cloudflare may do at any time, see the header
    # — still leaves a usable poster behind. There is no half-poster to guard
    # against the way there is a half-video: it is written whole to local disk
    # first, and only then put.
    if aws s3api put-object \
      --endpoint-url "$R2_S3_ENDPOINT" \
      --bucket "$R2_BUCKET" \
      --key "$POSTER_KEY" \
      --body "$POSTER" \
      --content-type image/jpeg >/dev/null 2>&1; then
      POSTER_KEY_OUT="$POSTER_KEY"
    fi
  fi
  set -e
fi

# Reported on both paths below, so it is built once here. Empty when there is
# no poster, which `jq -n` would make null — but this script has no jq in its
# hot path and printf is what the rest of it uses, so the fragment is empty
# string or a real object tail.
if [ -n "$POSTER_KEY_OUT" ] && [ -n "$POSTER_W" ] && [ -n "$POSTER_H" ]; then
  POSTER_JSON=$(printf ',"posterKey":"%s","posterWidth":%s,"posterHeight":%s' \
    "$POSTER_KEY_OUT" "$POSTER_W" "$POSTER_H")
else
  POSTER_JSON=""
fi

# Probe before encoding, and skip the encode entirely when the source is
# already what this script would produce.
#
# Re-encoding an H.264 1080p file is worse than useless: it costs container
# time, it loses a generation of quality, and — because the original is kept
# forever — it permanently doubles what the video occupies in R2. The trigger
# upstream is only `mimeType.startsWith("video/")`, which cannot tell an
# iPhone HEVC clip from a file somebody already exported correctly.
#
# The bar is deliberately the three things this feature exists to fix, and
# nothing more: codec, height, and pixel format. Not `level`, not faststart —
# a file that is h264/<=1080/yuv420p but has its moov atom at the end still
# plays everywhere, just with a slower start, and that is not worth a
# generation of quality to correct.
CODEC=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,height,pix_fmt \
  -of csv=p=0:nk=1 "$IN" </dev/null | tr -d '\n' | tr ',' ' ')
SRC_CODEC=$(echo "$CODEC" | cut -d' ' -f1)
SRC_HEIGHT=$(echo "$CODEC" | cut -d' ' -f2)
SRC_PIXFMT=$(echo "$CODEC" | cut -d' ' -f3)

if [ "$SRC_CODEC" = "h264" ] && [ "$SRC_PIXFMT" = "yuv420p" ] \
  && [ -n "$SRC_HEIGHT" ] && [ "$SRC_HEIGHT" -le 1080 ] 2>/dev/null; then
  # Nothing is uploaded and no key is reported: the media row keeps pointing
  # at the file it already had, which is the correct outcome — there is no
  # second object, so nothing to charge for or clean up later.
  # The poster still goes back, and this is the path that matters most for
  # it: an already-compliant file encodes nothing, so this line is the only
  # report it will ever make.
  printf '{"ok":true,"skipped":true,"reason":"already h264 %sp yuv420p"%s}\n' \
    "$SRC_HEIGHT" "$POSTER_JSON"
  exit 0
fi

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
printf '{"ok":true,"key":"%s","bytes":%s,"width":%s,"height":%s%s}\n' \
  "$DEST_KEY" "$BYTES" "$WIDTH" "$HEIGHT" "$POSTER_JSON"
