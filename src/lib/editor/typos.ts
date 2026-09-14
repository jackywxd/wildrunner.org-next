import type { JsonNode, PayloadContent } from "./serialize";
import { REWRITABLE } from "./ai-markers";

/**
 * 錯別字 — finding the wrong character, and changing only that.
 *
 * This is deliberately not `ai-markers.ts` with a different prompt. That
 * file exists to hand a whole document to a model and get a whole document
 * back, and the member's answer to it is one yes or no. A typo is the
 * opposite shape: the model finds five of them, three are real, and the
 * member has to be able to take those three and leave the other two. So
 * nothing here ever rebuilds the document — each accepted correction edits
 * the one text node the wrong characters sit in, and every other byte of
 * the article is the member's own, untouched, still.
 *
 * That is also why the model is never asked for prose. It is asked for a
 * list of `行號|錯|正`, and **everything it says is checked against the
 * document before the member is shown it**: a fragment that is not in that
 * line, or is in it twice, or spans a formatting boundary, is dropped
 * rather than guessed at. A model that invents a correction costs the
 * member nothing — they never see it. A model whose correction is applied
 * to the wrong sentence costs them an article they then have to proofread
 * against a version that no longer exists.
 *
 * Pure, on the plain JSON Payload stores, so the whole round trip is
 * testable without an editor, a browser or a model.
 */

/** One correction, checked against the document and safe to offer. */
export type Correction = {
  /** 1-based, as the model saw the line in `toTypoText`. */
  line: number;
  /** The fragment as the member wrote it. Occurs exactly once in the line. */
  wrong: string;
  /** What it should be. */
  right: string;
  /** The whole line, so the fragment can be shown where it sits. */
  context: string;
};

/** One text-bearing node and the text nodes its words live in. */
type Line = { text: string; nodes: JsonNode[] };

/**
 * What a correction is allowed to be, in size.
 *
 * A 錯別字 is a character or a word — 己經, 迫不急待 — and this button
 * promises to change nothing else. Without these the promise is the model's
 * to keep: `3|整句原文|整句改寫` is a well-formed correction line and would
 * rewrite a sentence under a label that says it fixed a typo.
 *
 * Two limits because one does not hold. 20 characters is far above any real
 * correction and far below a sentence — but a *short* sentence swapped for a
 * longer one clears it, which is what U-TYPO-3 found: 一切正常 → 一切都很正
 * 常，沒有問題 is eleven characters and is a rewrite. So the replacement must
 * also be about as long as what it replaces, which a swapped character is by
 * definition; the slack is for a character typed twice or dropped.
 */
const MAX_FRAGMENT_CHARS = 20;
const MAX_LENGTH_CHANGE = 2;

/**
 * What the model replies with, one correction per line.
 *
 * The full-width ｜ is accepted alongside `|` because the reply is written
 * in a Chinese context and a Chinese IME's bar is the full-width one — a
 * model that emits it is doing as it was told, and refusing it would drop
 * every correction in the batch for a punctuation width.
 */
const REPLY_LINE = /^\s*(\d+)\s*[|｜]\s*([^|｜]+?)\s*[|｜]\s*([^|｜]+?)\s*$/;

/* ------------------------------------------------------------------ */
/* document -> lines                                                    */
/* ------------------------------------------------------------------ */

/** Every text node under `node`, in reading order, links included. */
function textNodes(node: JsonNode, out: JsonNode[] = []): JsonNode[] {
  for (const child of node.children ?? []) {
    if (child.type === "text") out.push(child);
    else textNodes(child, out);
  }
  return out;
}

/**
 * The document's lines, in the order the model is shown them.
 *
 * A line is a node that directly holds text — a paragraph, a heading, a
 * quote, one item of a list — rather than a whole block, because a list is
 * three sentences and giving the model 「項目一項目二項目三」 as one line
 * would cost it the only context it has for judging 的/得/地.
 *
 * Only the blocks `ai-markers.ts` lets the model rewrite are walked. Images,
 * tables and code blocks are opaque there and opaque here, for the stronger
 * reason: 錯別字 in a code block are called identifiers.
 *
 * Blank lines are dropped rather than numbered, so the numbers the model
 * sees are indices into exactly this array.
 */
function collectLines(content: PayloadContent): Line[] {
  const lines: Line[] = [];

  const visit = (node: JsonNode) => {
    const children = node.children ?? [];
    if (children.some((child) => child.type === "text")) {
      const nodes = textNodes(node);
      const text = nodes.map((child) => String(child.text ?? "")).join("");
      if (text.trim()) lines.push({ text, nodes });
      return;
    }
    children.forEach(visit);
  };

  for (const node of content.root.children ?? []) {
    if (REWRITABLE.has(node.type)) visit(node);
  }
  return lines;
}

/** Non-overlapping occurrences of `needle` in `haystack`. */
function countIn(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * The one text node a correction may edit, or null if there is not exactly
 * one.
 *
 * Two conditions, and they fail differently. Not once in the line means the
 * model is describing a line that is no longer there, or a fragment so
 * short that there is no way to tell which of them it meant. Not in exactly
 * one node means the fragment straddles a formatting boundary — 「我**己**
 * 經」 — where replacing it would have to decide which half keeps the bold.
 * Both answers are "leave the member's article alone".
 */
function locate(lines: Line[], line: number, wrong: string): JsonNode | null {
  const target = lines[line - 1];
  if (!target) return null;
  if (countIn(target.text, wrong) !== 1) return null;
  const holders = target.nodes.filter((node) =>
    String(node.text ?? "").includes(wrong),
  );
  return holders.length === 1 ? holders[0] : null;
}

/* ------------------------------------------------------------------ */
/* the round trip                                                       */
/* ------------------------------------------------------------------ */

/**
 * The article as numbered lines, which is all the model is given.
 *
 * Numbered because the reply has to say *where*: a bare 「己經|已經」 is
 * not locatable in an article that says it twice, and a model asked for
 * character offsets invents them. A line number it can copy off the line it
 * is reading is the one piece of position it can be trusted with — and it
 * is checked anyway, in `parseCorrections`.
 */
export function toTypoText(content: PayloadContent): string {
  return collectLines(content)
    .map((line, index) => `${index + 1}: ${line.text}`)
    .join("\n");
}

/**
 * The model's reply, as corrections this document can actually take.
 *
 * `content` must be the document `toTypoText` was called on, or the line
 * numbers point at other sentences.
 *
 * Anything unparseable is skipped rather than reported. The reply is a list
 * and a model that prefixes it with 「以下是我找到的錯字：」 has still done
 * the job; failing the whole batch over a preamble would make the feature
 * work or not work by the sentence the model opened with.
 */
export function parseCorrections(
  reply: string,
  content: PayloadContent,
): Correction[] {
  const lines = collectLines(content);
  const seen = new Set<string>();
  const out: Correction[] = [];

  for (const raw of reply.split("\n")) {
    const match = REPLY_LINE.exec(raw);
    if (!match) continue;

    const line = Number(match[1]);
    const wrong = match[2];
    const right = match[3];

    // A correction that changes nothing is one the member would accept and
    // then not be able to see the effect of.
    if (wrong === right) continue;
    if (wrong.length > MAX_FRAGMENT_CHARS || right.length > MAX_FRAGMENT_CHARS) continue;
    if (Math.abs(wrong.length - right.length) > MAX_LENGTH_CHANGE) continue;
    if (!locate(lines, line, wrong)) continue;

    const key = `${line}|${wrong}|${right}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ line, wrong, right, context: lines[line - 1].text });
  }

  return out;
}

/**
 * The document with one correction made, or null if it no longer applies.
 *
 * Applied against the document *as it stands* rather than against the one
 * that was scanned, because the member can keep typing while the list is
 * open and the alternative is writing a stale document back over their
 * work. `locate` is what makes that safe: a line that has since been edited
 * no longer contains the fragment exactly once, and null is then the
 * honest answer — this correction has been overtaken, drop it.
 *
 * The input is never mutated. Everything here is JSON by construction, so
 * the clone is a stringify away and React sees a new document rather than
 * the same object with different contents.
 */
export function applyCorrection(
  content: PayloadContent,
  { line, wrong, right }: Correction,
): PayloadContent | null {
  const next = JSON.parse(JSON.stringify(content)) as PayloadContent;
  const node = locate(collectLines(next), line, wrong);
  if (!node) return null;
  node.text = String(node.text).replace(wrong, right);
  return next;
}
