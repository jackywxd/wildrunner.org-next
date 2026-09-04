/**
 * The picture WeChat will pick when somebody shares this page inside the app.
 *
 * WECHAT DOES NOT READ `og:image` FOR IN-APP SHARES. It takes the `<title>`
 * and the **first `<img>` in DOM order whose box is at least 300×300**.
 * Controlling that means putting a real, really-loaded image near the top of
 * the document — everything else here follows from "really loaded".
 *
 * FOUR RULES, EACH OF WHICH SILENTLY BREAKS THE PICK:
 *
 *  1. Not `display:none`, not `visibility:hidden`, not `width:0`. The pick
 *     depends on the image being laid out and fetched. Moved off-screen with
 *     `position:absolute` and `opacity:0` instead.
 *  2. Not `loading="lazy"`. An off-screen lazy image is never fetched, so it
 *     is never a candidate. This is the most common way the trick fails.
 *  3. No `srcset`, no `<picture>`. WeChat reads `src` and nothing else.
 *  4. PNG or JPEG. Older X5 builds are unreliable on WebP. `/wx` emits PNG.
 *
 * WHY IT CAN SIT INSIDE THE PAGE HERE, unlike on the site this was modelled
 * on, where it goes at the very top of `<body>`: the rule is "first image
 * **≥300×300**", and this site's header lockup is 72px and 28px. Nothing above
 * the page content is a candidate, so the thumbnail does not have to outrank
 * the header — it only has to be the first big one. `V-WXTHUMB` asserts that
 * property rather than "first img", so it stays honest if the header ever
 * grows a large image.
 *
 * Costs about 14 KB on the pages that carry it. `fetchPriority="low"` keeps it
 * away from LCP and `contain: strict` (see globals.css) guarantees no layout
 * shift. Only rendered on pages that have something to share.
 */
export function WeChatThumb({ src }: { src: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- a plain <img> is
       the requirement: next/image emits srcset, which WeChat ignores. */
    <img
      alt=""
      aria-hidden="true"
      className="wx-thumb"
      data-testid="wechat-thumb"
      decoding="async"
      fetchPriority="low"
      height={600}
      role="presentation"
      src={src}
      width={600}
    />
  );
}
