/**
 * The last pass before a sentence reaches a voice: say the units out loud.
 *
 * `articleSegments` decides *what* is said; this decides how a few written
 * shorthands are pronounced. Separate from it on purpose — that module's job
 * is the shape of the document, this one's is a handful of substitutions, and
 * the two are wrong in different ways.
 *
 * EVERY RULE HERE WAS MEASURED AGAINST THE 15 SEEDED ARTICLES, and the
 * measurement is the reason the list is this short. The obvious candidates —
 * finish times and paces, which are the loudest complaint about the reader —
 * are the ones the corpus refuses:
 *
 *   - **`H:MM` is NOT converted.** Seven hits across the corpus, and only five
 *     are durations (`最後完賽時間是3:36`, `結果2:05 跑完`, `以 1:45 分完賽`,
 *     `最后以 3:38完成`, `BQ，3:30 以内`). The other two are clock times —
 *     `時間已經是晚上9:45了` and `8:15全马和半马同时出发` — so a blanket
 *     "N小時MM分" would be wrong twice in seven. Reading a start time as a
 *     duration is worse than reading it flatly, and the difference is
 *     context, which a regex does not have.
 *   - **A bare `307` or `415` is NOT converted.** Those are a 3:07 marathon and
 *     a 4:15 pace, and they are the two examples that started this work — but
 *     scanning the corpus for three-digit runs returns **120** hits and the
 *     overwhelming majority are street addresses and phone numbers
 *     (`720 S Michigan`, `312-922-4400`, `333 E Benton Pl`, `350美金`). A rule
 *     that catches 307 catches all of those too.
 *
 * Both belong to the pass that has context to work with, not to this one.
 *
 * WHAT IT DOES NOT TOUCH, and this is the whole discipline: the article. This
 * runs on the copy handed to the voice. Nothing here reaches the page, the
 * stored body, or a search index.
 */

/**
 * `35K` → `35公里`. Five hits in the corpus, all kilometres: `110K`, `70K`,
 * `25K`, `35K`, `80K`.
 *
 * The digits are left alone deliberately — every engine reads `35` as 三十五
 * already, and rewriting numbers is a second class of mistake for no gain.
 * Only the letter, which a Chinese voice either spells out or skips, is
 * replaced.
 *
 * `(?![A-Za-z])` so `10KM`, `5Kg` and a stray `100Kcal` are left alone: those
 * carry their own unit and this rule would corrupt it.
 */
const KILOMETRES = /(\d)\s?K(?![A-Za-z])/gu;

/**
 * `120M` → `120英里`, and this is the weakest rule here — kept because the
 * corpus is unanimous and flagged because the corpus is small.
 *
 * Three hits, all miles: `胖狗120M` twice (Fat Dog 120 is a 120-mile race) and
 * `其他人都報了100M`. Elevation in these articles is written in Chinese —
 * `4000多米的爬升` — so metres never take this form here.
 *
 * The risk is an article that writes `500M爬升`, which this would say as 五百
 * 英里. If that ever appears, delete this rule rather than add a guard: the
 * two readings cannot be told apart without knowing whether the number is a
 * distance or a height.
 */
const MILES = /(\d)\s?M(?![A-Za-z])/gu;

/**
 * Decorative quotation marks, removed rather than spoken.
 *
 * Sixteen hits — `這個“習慣”的好處`, `“无伤安全完赛”`, `“BC的希望”小队`. They
 * carry no sound in any voice and some engines insert a pause for them, so
 * dropping them can only make the reading closer to what a person would say.
 * The words between them are untouched.
 *
 * Corner brackets 「」『』 are NOT included: they are the Traditional
 * convention this site writes in, and the same argument would apply, but the
 * corpus has none inside sentences to measure — so the rule stays where the
 * evidence is.
 */
const DECORATIVE_QUOTES = /[“”‘’]/gu;

/** One sentence, as it should be said. */
export function pronounce(text: string): string {
  return text
    .replace(KILOMETRES, "$1公里")
    .replace(MILES, "$1英里")
    .replace(DECORATIVE_QUOTES, "")
    .replace(/\s+/gu, " ")
    .trim();
}
