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
# poster.sh is a second entry point into the same image, not a second image:
# choosing a cover frame needs the same ffmpeg and the same bucket
# credentials, and `exec()` picks which script to run per invocation. Its
# header says why it is separate from transcode.sh rather than a flag on it.
COPY poster.sh /usr/local/bin/poster.sh
RUN chmod +x /usr/local/bin/transcode.sh /usr/local/bin/poster.sh

# NO `EXPOSE`, and that is not an oversight.
#
# `EXPOSE 33` was here briefly, added so `wrangler dev` would agree to start
# a container that declares no ports. It bought nothing — local `exec()` is
# broken in workerd 1.20260714.1 regardless (the request never reaches
# Docker at all) — and it coincided exactly with production transcodes
# hanging before their container ever started: the row reported `running`,
# no instance was created, and no error was logged anywhere.
#
# The suspected mechanism is the port readiness probe. With no port declared,
# `getTcpPort(33)` fails immediately and the library treats "not listening,
# but the process is running" as a healthy start (`isNotListeningError` in
# @cloudflare/containers). Declaring the port plausibly turns that fast
# failure into a wait on something that will never answer, because nothing
# in this image listens anywhere — it is driven entirely by `exec()`.
#
# Production never needed it: Cloudflare's docs say "all of your container's
# ports will be accessible by your Worker" there.

# The container is driven by `exec()` from the Durable Object, so there is no
# HTTP server to run. It idles until told to do something.
#
# `sleep` as PID 1 IGNORES SIGTERM — Linux delivers no signal to a
# namespace's PID 1 unless it installed a handler, and `sleep` installs none.
# So the library's `stop()` cannot end this container; only SIGKILL
# (`destroy()`) can, which is why the Durable Object uses nothing else. See
# `release` in src/index.ts: relying on `stop()` left containers running for
# days.
#
# Not "fixed" with a trap or tini — yet — and the reason is an open
# question, not a finding. Cloudflare's docs say a host restart or rollout
# sends SIGTERM to this process and SIGKILL up to 15 minutes later. A trap
# would make PID 1 exit at the SIGTERM and take a running ffmpeg with it;
# ignoring it in principle lets an encode use that window. But that benefit
# has not been observed: deploying this Worker mid-transcode produced
# `transcode.sh exited 137` twice (see `run` in src/index.ts), i.e. the
# encode did NOT survive. Until a rollout is watched end to end, neither
# choice is shown to be better, so the existing one stays.
ENTRYPOINT ["sleep", "infinity"]
