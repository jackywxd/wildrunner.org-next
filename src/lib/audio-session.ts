/**
 * Declare that this page's sound is the point of it — the same call, and the
 * same reasons, as haijieliu.com's `src/lib/audioSession.ts`.
 *
 * Without it the category can fall back to "ambient", which the iPhone's
 * ring/silent switch mutes and other apps' audio talks over; with it the
 * music keeps playing when the screen locks or the reader switches app.
 * Safari 16.4+ only; elsewhere `navigator.audioSession` is absent and this
 * does nothing.
 *
 * Call it inside the tap that starts the sound. The session belongs to the
 * document, so it carries across client-side navigation — which is what lets
 * the site's music (`SiteMusic`) play on from page to page.
 */
export function claimPlaybackAudioSession(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  // Re-asserting the same value is a no-op, but flipping types mid-session
  // upsets iOS, so only write when it is not already what we need.
  if (!session || session.type === "playback") return;
  try {
    session.type = "playback";
  } catch {
    // Older implementations reject unknown values; the default still plays.
  }
}
