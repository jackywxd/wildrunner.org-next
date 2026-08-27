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

# LOCAL DEVELOPMENT ONLY. Nothing listens here and nothing is meant to —
# this container has no HTTP server at all. But `wrangler dev` refuses to
# start a container that declares no ports ("The container does not expose
# any ports"), while production needs none, because there "all of your
# container's ports will be accessible by your Worker". So this line buys
# local iteration and is inert once deployed.
#
# 33 specifically, because that is `FALLBACK_PORT_TO_CHECK` in
# @cloudflare/containers: with no `defaultPort` set (see src/index.ts on why
# it must stay unset), the library probes that port during startup and
# treats "connection refused, but the process is running" as a healthy
# start. Exposing the port it already probes keeps local and deployed
# behaviour on the same path.
EXPOSE 33

# The container is driven by `exec()` from the Durable Object, so there is no
# HTTP server to run. It idles until told to do something, and Cloudflare
# stops it after `sleepAfter`.
ENTRYPOINT ["sleep", "infinity"]
