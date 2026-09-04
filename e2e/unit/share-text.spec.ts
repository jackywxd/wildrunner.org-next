import { expect, test } from "@playwright/test";

import {
  hashtagsFor,
  wechatText,
  xiaohongshuText,
  type ShareSubject,
} from "@/lib/share/share-text";

/**
 * U-SHARETEXT — the two clipboard texts.
 *
 * ONE OF THESE ASSERTIONS PROTECTS AGAINST A REAL-WORLD PENALTY, not a broken
 * page. Xiaohongshu suppresses off-site traffic — outbound links, WeChat ids,
 * QR codes, even text OCR finds inside a picture. Mild outcome: 15 days of
 * reduced reach. Severe: the account. So "the 小紅書 text contains no URL" is
 * not a formatting preference, and it is asserted against the *output* rather
 * than the inputs, because titles are member-written and somebody will
 * eventually publish one with a link in it.
 *
 * The others: a WeChat text with no link is useless (the link is the whole
 * point there), and hashtags that use the site's own category names reach
 * nobody — 「UTMB 世界系列賽」 is correct and unsearched, 「越野跑」 is what
 * people type. That failure is invisible: the post simply goes nowhere.
 */

const race: ShareSubject = {
  kind: "race",
  name: "威士拿 UTMB",
  year: 2026,
  series: "utmb",
  location: "Whistler, BC",
  distanceSummary: "100M / 100K / 50K",
  url: "https://wildrunner.org/races/utmb-whistler/2026",
};

const post: ShareSubject = {
  kind: "post",
  title: "我的第一場百英里",
  author: "追雲逐雪",
  url: "https://wildrunner.org/posts/my-first-hundred",
};

test("U-SHARETEXT-T1: the 小紅書 text never carries a link", async () => {
  for (const subject of [race, post]) {
    const text = xiaohongshuText(subject);
    expect(text, `${subject.kind}: 小紅書 text must not carry a URL`).not.toMatch(
      /https?:\/\/|www\.|wildrunner\.org/i,
    );
  }
});

test("U-SHARETEXT-T2: a link smuggled in through a member-written title is stripped", async () => {
  // The accident this guards: titles are written by members, and one day one
  // will contain a link. Trusting every future caller is what the strip exists
  // to avoid.
  const text = xiaohongshuText({
    ...post,
    title: "我的紀錄在 strava.com/activities/123 這裡",
  });
  expect(text).not.toMatch(/strava\.com|https?:\/\//i);
  // The sentence survives, minus the link.
  expect(text).toContain("我的紀錄在");
});

test("U-SHARETEXT-T3: the 微信 text carries the link, because there it is the point", async () => {
  expect(wechatText(race)).toContain(race.url);
  expect(wechatText(post)).toContain(post.url);
  // And the heading, so the paste is readable on its own.
  expect(wechatText(race)).toContain("威士拿 UTMB 2026");
});

test("U-SHARETEXT-T4: hashtags are the words people search, not the site's own labels", async () => {
  const tags = hashtagsFor(race);
  // fixture-scoped: a UTMB race in Whistler, BC — the series words plus both
  // halves of the place, each a tag on its own.
  expect(tags).toEqual(["越野跑", "跑步", "UTMB", "Whistler", "BC"]);
  // The site's own series label reaches nobody and must not appear.
  expect(tags).not.toContain("UTMB 世界系列賽");

  // A marathon is a different word entirely.
  expect(hashtagsFor({ ...race, series: "marathon", location: undefined })).toEqual([
    "馬拉松",
    "跑步",
  ]);
});

test("U-SHARETEXT-T5: a place is split, and a sentence-long one is dropped", async () => {
  // "Grande Cache, Alberta" is two tags. A location field that has been used
  // as a notes field would otherwise become a tag nobody could ever type.
  expect(hashtagsFor({ ...race, series: "wtm", location: "Grande Cache, Alberta" })).toEqual([
    "越野跑",
    "跑步",
    "Grande Cache",
    "Alberta",
  ]);
  expect(
    hashtagsFor({ ...race, series: "wtm", location: "從溫哥華開車三小時可以到的一個小鎮" }),
  ).toEqual(["越野跑", "跑步"]);
});
