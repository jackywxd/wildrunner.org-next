/**
 * How a member's name becomes UltraSignup requests.
 *
 * The results page is grouped by first name and last name, not by account.
 * "Xu Dong Wu" is therefore two different pages, and they are not the same
 * person record:
 *
 *   fname=Xu Dong & lname=Wu     → historybyname/Xu%20Dong/Wu/     id 2304249
 *   fname=Xu & lname=Dong Wu     → historybyname/Xu/Dong%20Wu/     id 2678040
 *
 * The HTML at results_participant.aspx does not contain the results. It
 * loads `/service/events.svc/historybyname/{first}/{last}/`. Every place the
 * surname boundary can sit is a separate request; stopping at "the last
 * word is the surname" drops the second id and the races that only live
 * there.
 */

export type NameSplit = {
  fname: string;
  lname: string;
};

const TOKEN = /^[\p{L}][\p{L}'’.-]*$/u;

/**
 * n words are n−1 requests to an endpoint UltraSignup never published, and
 * every load and every new-distance import repeats them. Five words — four
 * requests — covers every real name we have seen; past that the name is
 * refused rather than fanned out.
 */
export const MAX_NAME_WORDS = 5;
export const MAX_NAME_LENGTH = 80;

/**
 * Every fname/lname split of a name, surname-last first.
 *
 * `null` when the text cannot be a name we are willing to put in a URL:
 * fewer than two words, more than `MAX_NAME_WORDS`, or a word that is not
 * letters. A slash or a question mark would change the request path, so
 * those never get as far as encoding.
 */
export function nameSplits(input: string): NameSplit[] | null {
  if (input.length > MAX_NAME_LENGTH) return null;
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (
    tokens.length < 2 ||
    tokens.length > MAX_NAME_WORDS ||
    tokens.some((token) => !TOKEN.test(token))
  ) {
    return null;
  }
  const splits: NameSplit[] = [];
  for (let boundary = tokens.length - 1; boundary >= 1; boundary -= 1) {
    splits.push({
      fname: tokens.slice(0, boundary).join(" "),
      lname: tokens.slice(boundary).join(" "),
    });
  }
  return splits;
}

/** The JSON the results page itself requests. Path segments are encoded. */
export function historyUrl(split: NameSplit): string {
  const fname = encodeURIComponent(split.fname);
  const lname = encodeURIComponent(split.lname);
  return `https://ultrasignup.com/service/events.svc/historybyname/${fname}/${lname}/`;
}
