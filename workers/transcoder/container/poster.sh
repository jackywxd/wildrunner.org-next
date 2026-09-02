#!/bin/sh
# Take ONE frame from a video, at a time the member chose, and write it to R2.
#
#   poster.sh <source-url> <poster-key> <seconds>
#
# Prints one line of JSON on success:
#   {"ok":true,"posterKey":"...","posterWidth":W,"posterHeight":H}
#
# WHY THIS IS NOT transcode.sh WITH AN ARGUMENT. That script already grabs a
# poster, one second in, on its way past — and it treats it as an improvement
# to how the video is drawn rather than as the job, so every failure there is
# swallowed and reported as success with no `posterKey`. That is right for a
# poster nobody asked for. It is wrong here: a member pressed a button and is
# waiting to see that frame, so a failure has to travel back as a failure.
#
# The bigger reason is what re-running the transcode would do to the record.
# `transcodeResult` writes `skipped` whenever the container encodes nothing,
# and almost every video in this corpus is already h264/1080p — so asking for
# a new poster through the transcode path would relabel a genuinely
# transcoded video as one that never needed it. scripts/backfill-video-
# posters.ts refuses to re-queue `done` rows for exactly that reason. A
# separate script cannot make that mistake: it never decides whether to
# encode, because it never encodes.
#
# The container is otherwise the same one, running the same ffmpeg, reached
# through the same Durable Object per media id — so a poster request and a
# transcode for one video still serialize instead of fighting over the file.

set -eu

SRC_URL="$1"
POSTER_KEY="$2"
SECONDS_IN="$3"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

IN="$WORK/in"
POSTER="$WORK/poster.jpg"

# --fail so an HTML error page is never mistaken for a video. --location
# because R2 public URLs can redirect.
curl --fail --silent --show-error --location --output "$IN" "$SRC_URL"

# `-ss` BEFORE `-i` makes this an input seek, which jumps to the keyframe
# rather than decoding everything up to it. On a long video the difference is
# seconds against minutes, and the member is waiting.
#
# That also means the frame returned is the nearest keyframe at or before the
# requested time, not the exact displayed frame. Accepted deliberately: an
# accurate seek (`-ss` after `-i`) decodes the whole prefix, and for choosing
# a cover picture "about there" is what the member means. The UI says the
# time it asked for, so a keyframe a fraction earlier reads as the same
# moment.
ffmpeg -nostdin -y -ss "$SECONDS_IN" -i "$IN" -frames:v 1 -q:v 3 \
  -loglevel error "$POSTER" 2>/dev/null || true

# A seek past the last keyframe writes nothing at all rather than failing, so
# an empty file is the signal to fall back — same shape as transcode.sh. This
# is what a member gets for picking a moment inside the final GOP, or for a
# clip shorter than the time asked for.
if [ ! -s "$POSTER" ]; then
  ffmpeg -nostdin -y -i "$IN" -frames:v 1 -q:v 3 \
    -loglevel error "$POSTER" 2>/dev/null || true
fi

# Unlike transcode.sh, this one fails. The poster IS the job here.
if [ ! -s "$POSTER" ]; then
  echo "could not extract a frame at ${SECONDS_IN}s" >&2
  exit 1
fi

POSTER_DIMS=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=p=0:nk=1 "$POSTER" \
  </dev/null | tr -d '\n' | tr ',' ' ')
POSTER_W=$(echo "$POSTER_DIMS" | cut -d' ' -f1)
POSTER_H=$(echo "$POSTER_DIMS" | cut -d' ' -f2)

# Same key every time, so re-picking a frame overwrites rather than
# accumulating an object per attempt. The site busts the cache on its side by
# versioning the URL it stores — see posterUrlForFrame in
# src/lib/media/transcode-state.ts.
aws s3api put-object \
  --endpoint-url "$R2_S3_ENDPOINT" \
  --bucket "$R2_BUCKET" \
  --key "$POSTER_KEY" \
  --body "$POSTER" \
  --content-type image/jpeg >/dev/null

printf '{"ok":true,"posterKey":"%s","posterWidth":%s,"posterHeight":%s}\n' \
  "$POSTER_KEY" "$POSTER_W" "$POSTER_H"
