/**
 * The largest single file this site accepts, and why that number.
 *
 * NOTHING CAPPED A SINGLE FILE BEFORE THIS. `payload.config.ts` sets no
 * `limits.fileSize`, `Media.ts` checks no size, and `directUploadInit` looked
 * only at the member's remaining quota — so the only ceiling was 100 GB of
 * quota, one file at a time.
 *
 * WHAT ACTUALLY BREAKS FIRST, measured rather than guessed, because the
 * obvious candidates are not it:
 *
 *   - R2 multipart: 10,000 parts × 5 MB (`CHUNK_SIZE`) = 50 GB. Not it.
 *   - the Worker's 100 MB request body: already sidestepped, since anything
 *     over `DIRECT_UPLOAD_THRESHOLD` goes browser → R2 and never through it.
 *   - the transcode container's disk: `standard-4` is 20 GB, and the largest
 *     file in the production corpus (1.17 GB) peaks around 2 GB — source plus
 *     output. Not it either.
 *
 * It is the transcode **lease**. `LEASE_TIMEOUT_MS` is 15 minutes
 * (src/lib/media/transcode-state.ts); a job still running when it expires is
 * reclaimed and re-dispatched, and enough of those turn a good video into
 * `failed`. Encoding measures 3.11× realtime on 4 vCPU and that 1.17 GB file
 * took about 4 minutes end to end (workers/transcoder), so the lease starts
 * being a real risk somewhere in the low single-digit gigabytes.
 *
 * 1 GB sits under that with room to spare, and it is not a number that costs
 * anybody a real upload: of the 27 videos in production, the largest is
 * 1172.9 MB and the mean is 410.3 MB — so it clears every one of them except
 * the single biggest, and that one by 3%.
 *
 * THE HONEST CAVEAT: the lease cares about **duration**, not bytes. A 1 GB 4K
 * clip is a few minutes of video and encodes quickly; 1 GB of low-bitrate
 * 1080p could be forty minutes and would not. Bytes are the proxy, chosen
 * because a browser knows a file's size for free and this cap is a guard
 * rail rather than a scheduler. If the ceiling is ever raised much past this,
 * the thing to add is a duration check (`video.duration` is readable in the
 * browser before upload), not a bigger number.
 *
 * Applied to every file, not only to video: an image over a gigabyte is not a
 * case worth carrying a second rule for, and `downscaleImage` has already run
 * by the time anything is checked.
 */
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024

/** For a message a member reads, so 1073741824 never reaches one. */
export const MAX_UPLOAD_LABEL = '1 GB'
