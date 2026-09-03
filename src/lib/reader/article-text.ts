/**
 * An article's body, reduced to the sentences a voice should say.
 *
 * WHAT IS DROPPED AND WHY, from counting the real corpus rather than reading
 * the renderer: across the 15 seeded posts the body holds 320 `text` nodes,
 * 191 paragraphs, 61 list items, 50 headings — and **111 uploads**. Images are
 * a third of every node in this corpus. Reading their alt text aloud would put
 * a hundred interruptions into fifteen articles, so an upload contributes
 * nothing and neither does a horizontal rule. A code block is dropped for the
 * same reason in stronger form: punctuation and identifiers read as noise, and
 * `@/lib/mdx-import` is what makes one reachable at all.
 *
 * SENTENCES, NOT PARAGRAPHS, and that is the one decision with a mechanism
 * behind it. A paragraph is what the page is laid out in; a sentence is what a
 * voice says between breaths, and `SpeechSynthesisUtterance` is queued per
 * utterance. Chrome is also long known to cut a single long utterance short —
 * a behaviour nothing in this repository can reproduce, since headless
 * Chromium has no voices at all (see the reader's own header). Splitting by
 * sentence is right for speech on its own terms and happens to make that
 * failure unreachable, which is a better reason than tuning a number against a
 * rumour. The character cap below is only for a sentence that never ends.
 *
 * Pure, and taking plain JSON, so the whole rule is exercised by the unit lane
 * with no editor, no browser and no voices.
 */

import { soleYouTubeUrl } from "@/lib/youtube";

/**
 * Where a sentence ends, in both scripts this site writes in.
 *
 * The CJK marks are full-width and carry no trailing space, so a split has to
 * keep the mark with the sentence it ends — `。」` and `？」` are one ending,
 * not two. Latin punctuation is included because article bodies mix them.
 *
 * A FULL STOP ONLY COUNTS BEFORE WHITESPACE, which is the difference between
 * splitting "…in Canada. It's known…" and mangling "3.5 公里" or "utmb.world".
 * Leaving `.` out altogether was the first version, and running this over the
 * corpus showed what that costs: the English articles never split at all and
 * were hard-cut mid-word at the cap below — 5 of 750 segments, all of them
 * prose that reads perfectly well and simply never met a full-width mark.
 */
const SENTENCE_END = /([。！？；!?;]+["」』）)\]]*|\.(?=\s|$))/;

/**
 * The longest run of characters that may go to the voice unbroken.
 *
 * Only reached by a "sentence" that contains no ending punctuation at all —
 * a heading, a list item, or prose written without full stops. Splitting one
 * of those anywhere is a compromise; splitting it nowhere risks the whole
 * remainder going unsaid, which is the worse of the two.
 */
const MAX_SEGMENT_CHARS = 180;

/**
 * A bare URL, which is shown but never said.
 *
 * `soleYouTubeUrl` already removes the paragraph that is *only* a video link.
 * This is the other shape the corpus actually contains — a URL inside a
 * sentence, four of them across the 15 posts: 「原文链接：https://…」 and
 * 「比賽視頻 https://www.youtube.com/watch?…」. A voice spells those out
 * character by character, and the second one also split at its own `?`,
 * producing two utterances of nonsense.
 *
 * Removed rather than spoken, and that is a deliberate departure from "say
 * what the page shows": the page shows a link a reader can see and click,
 * while the voice can only recite it. The sentence around it survives.
 */
const BARE_URL = /https?:\/\/\S+/g;

/** The node shapes this walks. Deliberately loose: the body is stored JSON. */
type LexicalNode = {
  type?: string;
  text?: string;
  children?: LexicalNode[];
};

/**
 * THERE IS NO SKIP LIST, and that is a measurement rather than an oversight.
 *
 * The first version carried one — `upload`, `horizontalrule`, and a Payload
 * `Code` block — and a deliberate break showed the upload entry could not
 * change any answer. Checking the corpus explains why: all **111** upload
 * nodes across the 15 posts have the keys `type, version, format, fields,
 * relationTo, value, id` and **none has `children`**. A horizontal rule has
 * none either, and a code block keeps its source in `fields.code`. A node with
 * no text and no children contributes nothing by walking it, so naming it
 * bought nothing but a guard no test could exercise.
 *
 * What survives is the behaviour, and U-READER-1 pins it: an image between two
 * paragraphs is silent and does not interrupt the two around it.
 */

/** Block-level nodes: each one ends the segment it was collecting. */
const BLOCK = new Set([
  "paragraph",
  "heading",
  "listitem",
  "quote",
  "list",
  "root",
]);

/** Collect the text of one block, walking inline children (links included). */
function blockText(node: LexicalNode): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "linebreak") return " ";
  return (node.children ?? []).map(blockText).join("");
}

/**
 * Split one block's text into sentences.
 *
 * The ending punctuation stays attached to the sentence it closes, so a voice
 * reads "跑完了。" with the fall the mark asks for rather than as a bare
 * clause — which is the whole reason to split here rather than on a fixed
 * length.
 */
function sentences(text: string): string[] {
  const parts = text.replace(BARE_URL, " ").split(SENTENCE_END);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i] ?? "";
    const ending = parts[i + 1] ?? "";
    const sentence = `${body}${ending}`.replace(/\s+/g, " ").trim();
    // A segment that held nothing but a URL is now bare punctuation — say
    // nothing rather than a lone colon.
    if (sentence && /[\p{L}\p{N}]/u.test(sentence)) out.push(sentence);
  }
  return out.flatMap(hardSplit);
}

/** Last resort for a sentence with no ending — see MAX_SEGMENT_CHARS. */
function hardSplit(sentence: string): string[] {
  if (sentence.length <= MAX_SEGMENT_CHARS) return [sentence];
  const out: string[] = [];
  for (let i = 0; i < sentence.length; i += MAX_SEGMENT_CHARS) {
    out.push(sentence.slice(i, i + MAX_SEGMENT_CHARS));
  }
  return out;
}

/**
 * Walk the tree, emitting one string per block, in document order.
 *
 * A `list` contains `listitem`s and both are block-level, so recursion has to
 * continue through a block rather than stopping at the first one — otherwise
 * every bulleted list in the corpus (31 lists, 61 items) is read as one
 * run-on line.
 */
function walk(node: LexicalNode, into: string[]): void {
  const children = node.children ?? [];
  const hasBlockChild = children.some((child) => BLOCK.has(child.type ?? ""));

  if (BLOCK.has(node.type ?? "") && !hasBlockChild && node.type !== "root") {
    // A paragraph that is nothing but a YouTube URL is a VIDEO on the page,
    // not a sentence — `payload-rich-text.tsx` swaps it for a player. Reading
    // it would say "h t t p s colon slash slash…" aloud, and the corpus has
    // one: measured by running this over all 15 seeded posts, which returned
    // `https://www.youtube.com/watch?` and `v=hmidfqoX6cc` as two separate
    // things to say. No fixture would have caught that; the real body did.
    //
    // `soleYouTubeUrl` rather than a URL test of its own. That rule already
    // has two consumers — the public renderer and the member's preview, made
    // to share it precisely because they had disagreed — and a third copy
    // here would be the same bug in a new place: the reader saying something
    // the page does not show.
    if (soleYouTubeUrl(node)) return;

    const text = blockText(node).trim();
    if (text) into.push(...sentences(text));
    return;
  }

  for (const child of children) walk(child, into);
}

/**
 * The article, as the ordered list of things to say.
 *
 * Takes `unknown` because the body is JSON out of the database and a post from
 * before any given editor change is still a post. Anything unrecognised
 * contributes nothing rather than throwing — a reader that refuses to start on
 * one odd node is worse than one that skips it.
 */
export function articleSegments(content: unknown): string[] {
  const root = (content as { root?: LexicalNode } | null)?.root;
  if (!root) return [];
  const out: string[] = [];
  walk(root, out);
  return out;
}
