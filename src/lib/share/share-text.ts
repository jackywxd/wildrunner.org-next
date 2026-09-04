/**
 * The two clipboard texts, and the one rule that matters.
 *
 * TWO BUTTONS, NOT ONE, because the two platforms want opposite things and a
 * single "copy" would have to be wrong for one of them:
 *
 *   微信      a link is the whole point — the card is rendered from the URL
 *   小紅書    a link is a liability
 *
 * WHY A LINK IS A LIABILITY THERE. Xiaohongshu actively suppresses off-site
 * traffic: outbound links, WeChat ids, QR codes, contact details — and text
 * that OCR finds *inside a picture* counts too. The mild outcome is 15 days of
 * reduced reach; the severe one is losing the account. So the 小紅書 text
 * carries no URL, and the poster it goes with carries no URL either.
 *
 * The brand still travels: it travels as a *name* (the member's byline and
 * 野馬營), which is not a link and is not suppressed. That is the whole
 * strategy — stop asking the platform to render our card, and hand people a
 * picture that already is one.
 *
 * PURE, so the rule is checked without a browser. `e2e/unit/share-text.spec.ts`
 * asserts the no-URL property against every shape this can produce, because it
 * is the one mistake here with a real-world cost.
 */

import type { RaceSeries } from "@/lib/races/catalogue";

export type ShareSubject =
  | {
      kind: "post";
      title: string;
      /** The public byline, never an account. */
      author?: string;
      url: string;
    }
  | {
      kind: "race";
      /** The race as a reader knows it — `nameZh` when there is one. */
      name: string;
      year: number;
      series: RaceSeries;
      location?: string;
      /** "100M / 100K / 50K", straight from the edition. */
      distanceSummary?: string;
      url: string;
    };

/**
 * The words people actually search on 小紅書, per series.
 *
 * NOT THE SITE'S OWN CATEGORY NAMES. `RACE_SERIES_LABELS` says 「UTMB 世界系列賽」
 * and 「World Trail Majors」, which are correct and which nobody searches. The
 * tags below are what the platform's own users type. Getting this wrong does
 * not break anything visibly — the post simply reaches nobody, which is the
 * failure mode worth naming here because it is invisible.
 */
const SERIES_TAGS: Record<RaceSeries, string[]> = {
  utmb: ["越野跑", "跑步", "UTMB"],
  wtm: ["越野跑", "跑步"],
  marathon: ["馬拉松", "跑步"],
  others: ["越野跑", "跑步"],
};

/**
 * A place, split into the tags a reader would search.
 *
 * `race-editions.location` is written for a schedule — "Chamonix, France",
 * "Grande Cache, Alberta" — so the comma is the split, and each half is a tag
 * on its own. A single tag of the whole string matches nothing.
 */
function locationTags(location: string | undefined): string[] {
  if (!location) return [];
  return location
    .split(/[,，、/]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 12);
}

export function hashtagsFor(subject: ShareSubject): string[] {
  const tags = subject.kind === "race" ? [...SERIES_TAGS[subject.series]] : ["越野跑", "跑步"];
  if (subject.kind === "race") tags.push(...locationTags(subject.location));

  // Deduped, order kept: the first tags are the ones with reach, and a
  // duplicate reads as carelessness in a place where care is the product.
  const seen = new Set<string>();
  return tags.filter((tag) => (seen.has(tag) ? false : (seen.add(tag), true)));
}

/** The headline both texts open with. */
function heading(subject: ShareSubject): string {
  return subject.kind === "post" ? subject.title : `${subject.name} ${subject.year}`;
}

/**
 * 小紅書 — no URL, ever.
 *
 * The assertion in the unit spec is on this function's *output*, not on its
 * inputs: a caller that puts a URL in a title would otherwise smuggle one
 * through, and that is exactly the accident this text exists to prevent. See
 * `stripUrls`.
 */
export function xiaohongshuText(subject: ShareSubject): string {
  const lines = [heading(subject)];

  if (subject.kind === "race") {
    const facts = [subject.location, subject.distanceSummary].filter(Boolean);
    if (facts.length > 0) lines.push(facts.join(" · "));
  } else if (subject.author) {
    lines.push(subject.author);
  }

  const tags = hashtagsFor(subject).map((tag) => `#${tag}`);
  if (tags.length > 0) lines.push("", tags.join(" "));

  return stripUrls(lines.join("\n"));
}

/** 微信 — the link is the point. */
export function wechatText(subject: ShareSubject): string {
  const lines = [heading(subject)];

  if (subject.kind === "race") {
    const facts = [subject.location, subject.distanceSummary].filter(Boolean);
    if (facts.length > 0) lines.push(facts.join(" · "));
  } else if (subject.author) {
    lines.push(subject.author);
  }

  lines.push(subject.url);
  return lines.join("\n");
}

/**
 * Belt and braces on the one rule that has a real-world cost.
 *
 * A title is member-written. Somebody will one day publish an article called
 * "我的 strava.com/xxx 紀錄", and the 小紅書 text would then carry a link the
 * author of this module never put there. Removing anything URL-shaped on the
 * way out costs one regex and closes that hole; the alternative is trusting
 * every future caller.
 *
 * Deliberately blunt — a bare domain is stripped too. A slightly odd sentence
 * is a much smaller price than reduced reach or a lost account.
 */
function stripUrls(text: string): string {
  return text
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\b[\w-]+\.(com|cn|ca|net|org|io|me|co)\b\S*/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
