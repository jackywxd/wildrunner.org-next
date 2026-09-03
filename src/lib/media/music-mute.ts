/**
 * "Not right now" about background music, wherever it is playing.
 *
 * ONE PREFERENCE, TWO PLACES, and that is the point rather than a convenience.
 * A visitor who silenced an album's slideshow and then opened an article has
 * not made a second decision — they have made the same one, and asking again
 * is what would surprise them. The key is named for the preference, not for
 * the gallery it started in.
 *
 * `sessionStorage`, not state and not `localStorage`. Not state, because it
 * has to survive a navigation between the two screens that share it. Not
 * `localStorage`, because a preference expressed once should not silence
 * everything a year later on a machine they have forgotten about; a tab is the
 * right lifetime for "not right now".
 */
const MUTE_KEY = "wr:music-muted";

export function readMusicMuted(): boolean {
  try {
    return window.sessionStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Private windows and blocked site data both throw on access rather than
    // returning null. Not knowing the preference means playing, which is what
    // a page with music is for.
    return false;
  }
}

export function writeMusicMuted(muted: boolean): void {
  try {
    window.sessionStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Losing the preference is a smaller failure than refusing the click.
  }
}
