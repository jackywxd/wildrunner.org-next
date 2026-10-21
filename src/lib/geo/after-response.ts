/**
 * Run work after the HTTP response has gone out, where the runtime allows it.
 *
 * WHY THE HOOKS CANNOT SIMPLY AWAIT. A lookup is a model call plus a geocoder
 * call, 2-10 seconds, and an UltraSignup import can create several events in
 * one request. Awaiting inside `afterChange` would make saving an event, or
 * importing a member's results, wait on two third parties — and a Nominatim
 * hiccup would fail a write that had nothing wrong with it.
 *
 * In a deployed Worker the request's `ctx.waitUntil` keeps the isolate alive
 * past the response, so the work finishes without anyone waiting for it. In
 * the CLI and the Local API there is no response to be late for, and no ctx:
 * there the task is awaited, which is also what a script wants — it must not
 * reach `process.exit()` with a write still in flight.
 *
 * THE CONTEXT IS READ FROM THE GLOBAL SLOT, NOT FROM `getCloudflareContext`.
 * That function, finding the slot empty, falls back to wrangler and asks for
 * the `remote: true` bindings `wrangler.jsonc` declares — in a script that is
 * a remote proxy session against whatever database the config names, opened
 * for no reason other than to discover there is no ctx. payload.config.ts
 * documents the same trap at length. The slot is the first thing
 * `getCloudflareContext` reads, written by the Worker entrypoint and by
 * `initOpenNextCloudflareForDev`; reading it directly answers "is there a
 * ctx" without ever starting anything.
 *
 * A task never throws out of here. Work done after the response has nobody to
 * report to, and one that rejected unhandled inside `waitUntil` would be
 * logged as a Worker error for what is, to the person who saved the event, a
 * non-event; the task records its own outcome (`geoStatus`) instead.
 */

const cloudflareContextSymbol = Symbol.for('__cloudflare-context__')

type ParkedContext = {
  ctx?: { waitUntil?: (promise: Promise<unknown>) => void }
  env?: Record<string, unknown>
}

export function parkedCloudflareContext(): ParkedContext | undefined {
  return (globalThis as { [cloudflareContextSymbol]?: ParkedContext })[cloudflareContextSymbol]
}

export async function afterResponse(task: () => Promise<void>): Promise<void> {
  const guarded = task().catch((error) => {
    console.error('[geo] background task failed', error)
  })
  const ctx = parkedCloudflareContext()?.ctx
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(guarded)
    return
  }
  await guarded
}
