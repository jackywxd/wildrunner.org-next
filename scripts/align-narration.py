"""
Forced-align sentences to an audio file: which second does each sentence start?

    echo '{"audio":"a.mp3","sentences":["第一句。","Second."],"language":"Chinese"}' \
      | /Applications/oMLX.app/Contents/Resources/Python/cpython-3.11/bin/python3.11 -I \
        scripts/align-narration.py

stdin is JSONL, one request per line; stdout is JSONL, one response per line, in
order: {"spans": [{"start": s, "end": s} | null, ...]}, one entry per sentence.
`null` means the sentence has no alignable token (punctuation only). Seconds are
of the audio file as given. The model is loaded once and serves every line.

WHY THIS EXISTS. Followed reading needs a time per sentence. The local pipeline
(narrate-local.ts) knows its own piece offsets exactly, but the MiniMax audio
already in production was made by a Worker that kept no timing. This reads the
time off the finished audio instead of re-generating it.

WHY OMLX'S PYTHON, AND WHY -I. This Mac has no `uv`, and nothing is pip-installed
for this: oMLX ships a Python with mlx-audio 0.6.3 inside. `-I` (isolated mode)
ignores PYTHONPATH so that a stray environment cannot change which mlx-audio is
imported, which is why the site-packages directory is put on sys.path below
instead of being passed from outside.

WHY THIS MODEL. Qwen3-ForcedAligner-0.6B-8bit, already in oMLX's model directory.
It aligns a KNOWN transcript, so nothing is transcribed and nothing is reworded:
the output has exactly the text we hand in, which is what lets us map back to
sentences. Chinese is one token per character, Latin runs one token per word
(`ForceAlignProcessor.tokenize_chinese_mixed`).

WHY 300 SECONDS. The aligner predicts a time class in 0..4999 at 80 ms each, so
400 s is where it physically runs out of classes. 300 s keeps clear of that edge
and refuses anything longer, loudly: a silently truncated file would give every
later sentence a wrong time and look like success. Windowing longer audio is the
caller's job.

HOW SENTENCES MAP TO SPANS. The sentences are joined with "\\n" and aligned in one
call (context across sentences is what makes the alignment good; per-sentence
cutting would need the boundaries we are trying to find). The newline matters:
joined with nothing, "...Bridge" + "Brooklyn..." would be one Latin token. Each
sentence is then tokenised on its own with the model's own processor, and the
concatenation of those per-sentence lists must equal the processor's tokens of
the joined text, token for token — otherwise we exit rather than attribute tokens
by a count that has drifted. A sentence's span is first token's start to last
token's end.

The aligner repairs non-monotonic timestamps itself (`fix_timestamp`), so spans
are non-decreasing in start; a token can still have zero length.
"""

from __future__ import annotations

import json
import sys

SITE_PACKAGES = (
    "/Applications/oMLX.app/Contents/Resources/Python/"
    "framework-mlx-base/lib/python3.11/site-packages"
)
MODEL_DIR = "~/.omlx/models/mlx-community/Qwen3-ForcedAligner-0.6B-8bit"
MAX_SECONDS = 300.0
SAMPLE_RATE = 16000  # mlx_audio.stt.utils.load_audio's default; the model's rate

sys.path.insert(0, SITE_PACKAGES)


def die(message: str) -> None:
    print(f"align-narration: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    import os

    from mlx_audio.stt.utils import load_audio, load_model

    model_dir = os.path.expanduser(MODEL_DIR)
    if not os.path.isdir(model_dir):
        die(f"model not found at {model_dir}")
    model = load_model(model_dir)
    processor = model.aligner_processor

    for line_no, line in enumerate(sys.stdin, 1):
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            audio_path = request["audio"]
            sentences = request["sentences"]
            language = request.get("language", "Chinese")
            if not isinstance(sentences, list) or not all(isinstance(s, str) for s in sentences):
                raise ValueError("sentences must be a list of strings")
        except (ValueError, KeyError) as error:
            die(f"line {line_no}: bad request ({error!r})")

        audio = load_audio(audio_path, sr=SAMPLE_RATE)
        seconds = audio.shape[0] / SAMPLE_RATE
        if seconds > MAX_SECONDS:
            die(
                f"line {line_no}: {audio_path} is {seconds:.1f}s, over the "
                f"{MAX_SECONDS:.0f}s limit; window it before aligning"
            )

        per_sentence = [processor.encode_timestamp(s, language)[0] for s in sentences]
        expected = [token for tokens in per_sentence for token in tokens]
        if not expected:
            print(json.dumps({"spans": [None] * len(sentences)}))
            sys.stdout.flush()
            continue

        result = model.generate(audio, "\n".join(sentences), language=language)
        items = result.items
        if [item.text for item in items] != expected:
            die(
                f"line {line_no}: aligner tokens differ from per-sentence tokens "
                f"({len(items)} vs {len(expected)}); refusing to attribute by count"
            )

        spans = []
        cursor = 0
        for tokens in per_sentence:
            if not tokens:
                spans.append(None)
                continue
            first, last = items[cursor], items[cursor + len(tokens) - 1]
            spans.append({"start": first.start_time, "end": last.end_time})
            cursor += len(tokens)
        print(json.dumps({"spans": spans}))
        sys.stdout.flush()


main()
