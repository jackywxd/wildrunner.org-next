/**
 * A finishing time, as a number of seconds and as the string a runner writes.
 *
 * SECONDS IN THE DATABASE, NEVER THE STRING. `"38:42:15"` sorts and compares
 * as text — `"9:00:00"` lands after `"38:42:15"`, and "who was fastest at this
 * race" cannot be asked at all. The formatting is a rendering concern and
 * lives here rather than at the several places that show one.
 *
 * HOURS ARE NOT WRAPPED AT 24, which is the whole reason this is not
 * `Date`/`toISOString().slice(11, 19)`. A hundred-miler takes 30-40 hours and
 * `38:42:15` is what the results page prints; a clock would render that as
 * `14:42:15` the following day, silently turning a finish into a different
 * finish. There is no day component and there must not be one.
 *
 * INPUT IS WHAT A RUNNER COPIES FROM A RESULTS PAGE, so `H:MM:SS` and
 * `HH:MM:SS` are both accepted and minutes/seconds are range-checked. `MM:SS`
 * is deliberately NOT accepted: a bare `45:30` is 45 minutes to a road runner
 * and 45 hours to nobody, but the same two numbers are ambiguous enough that
 * guessing would quietly store the wrong magnitude. A trail race long enough
 * to be worth recording has an hours component, even if it is `0`.
 */

/** Seconds in a day is NOT a bound here — see the header. */
const PATTERN = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/;

/**
 * `"38:42:15"` → `139335`, or `null` when the text is not a finishing time.
 *
 * `null` rather than a throw or a `0`: the caller is a form, and "this is not
 * a time" is an answer it has to render rather than an exception. `0` would be
 * worse than either — it is a valid duration, so a typo would store a finish
 * of zero seconds.
 */
export function parseFinishTime(input: string): number | null {
  const match = PATTERN.exec(input.trim());
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * `139335` → `"38:42:15"`.
 *
 * Hours are not padded to two digits beyond what they need — `9:05:00` rather
 * than `09:05:00` — because that is how results are written and how the field
 * accepts them back. Minutes and seconds always are, because `9:5:0` is not.
 */
export function formatFinishTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
