# linux/amd64 is required — Cloudflare Containers runs no other architecture,
# and this repo is developed on Apple silicon, so an accidental arm64 build
# would push an image that simply never starts.
FROM --platform=linux/amd64 alpine:3.20

# ffmpeg does the work; aws-cli writes the result back to R2 over its S3 API.
# curl fetches the source: the media bucket is already public behind
# images.wildrunner.org, so reading needs no credentials — only the write
# does. Pulling 1.17 GB through the Worker instead would be the worst of
# both worlds.
RUN apk add --no-cache ffmpeg curl aws-cli jq

COPY transcode.sh /usr/local/bin/transcode.sh
RUN chmod +x /usr/local/bin/transcode.sh

# The container is driven by `exec()` from the Durable Object, so there is no
# HTTP server to run. It idles until told to do something, and Cloudflare
# stops it after `sleepAfter`.
ENTRYPOINT ["sleep", "infinity"]
