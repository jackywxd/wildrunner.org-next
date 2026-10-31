# /// script
# requires-python = ">=3.10"
# dependencies = ["mlx-audio[tts]==0.6.3"]
# ///
"""
Audition local text-to-speech models for article narration, on Apple Silicon.

WHY THIS EXISTS. Post 33 on production is a 134,839-character race report,
thirteen times what `minimax/speech-2.8-hd` accepts in one call, and roughly
six hours of audio — more than a Worker can hold in memory or finish inside a
request. Narrating it on a Mac and uploading the MP3 under the key
`articleAudioKeyForPost` already computes sidesteps all of that. The voice
the site has now was chosen by listening to four candidates, so this one is
chosen the same way: same sentences, every voice, files side by side.

WHAT IT MEASURES, besides the sound:

  - Real-time factor (seconds of generation per second of audio), counted
    after a warm-up call so model loading and first-run compilation are not
    in it. That number decides whether post 33 is an overnight job or a week.
  - Whether a voice stays the same voice across sentences. Breeze-TTS-2 has
    no preset speakers — its voice comes from a text description
    (`instruct`) — so each sentence is a fresh draw from that description.
    The joined file is where a voice that drifts mid-paragraph becomes
    audible. Qwen3-TTS CustomVoice uses fixed speaker embeddings and should
    not drift; listen anyway.

SENTENCE BY SENTENCE, because that is how the real pipeline will feed it:
`articleScript` yields one sentence per line, and nothing long should go to a
model in one piece. Each line is generated separately and the lines are
joined with a short pause.

Run on the Mac (needs `uv`; it installs mlx-audio into a throwaway env):

    uv run scripts/tts-audition.py
    uv run scripts/tts-audition.py --text-file my-lines.txt
    uv run scripts/tts-audition.py --models qwen --voices vivian,uncle_fu

Models download from Hugging Face on first use (3.6 GB and 6.4 GB) into the
usual cache, so a copy already fetched by another app under the same repo id
is reused.

Writes WAV files and `report.md` to `--out` (default `tts-audition-out/`,
which is git-ignored). Nothing here touches R2, D1 or the network beyond the
model download.
"""

from __future__ import annotations

import argparse
import gc
import time
from pathlib import Path

import mlx.core as mx
import numpy as np
from scipy.io import wavfile

from mlx_audio.tts.utils import load_model

QWEN = "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16"
BREEZE = "mlx-community/Breeze-TTS-2-mlx"

# The first two lines are verbatim from post 33. The third is built from that
# article's closing stats line. The last three are Traditional Chinese, the
# site's own script: two in the form the rewrite step (`spoken-script.ts`)
# produces, and one left raw so you can hear what a model does with `3:36`
# when nothing has rewritten it.
DEFAULT_LINES = [
    "黑暗中，我几乎看不清脚下的路。",
    "那个看起来遥不可及的愿望，真的实现了。",
    "UTMB Mont-Blanc 2026，全程173.6公里，累计爬升9700米，完赛时间29小时23分51秒。",
    "柏林跑了三小時零七分，保持每公里四分十五秒左右的配速。",
    "晚上九點四十五分，我們在 Squamish 50/50 的起點集合。",
    "完賽時間是3:36。",
]

# Breeze has no named speakers; each entry here is a voice it is asked to be.
# Written for narration of first-person race reports, which is what the site
# publishes.
BREEZE_VOICES = {
    "male-calm": "一位沉穩溫和的中年男性，普通話標準，語速適中，像在朗讀一篇散文。",
    "male-taiwan": "一位溫和的男性，台灣口音的華語，語氣自然，像在說故事。",
    "female-clear": "一位聲音清晰親切的年輕女性，普通話標準，語速適中，語氣平穩。",
}

# Breeze's own README uses 4; a fixed seed makes reruns comparable.
BREEZE_CFG_SCALE = 4.0
SEED = 0

# Pause inserted between sentences in the joined file.
GAP_SECONDS = 0.35

# Post 33's script length, for the "how long would the whole thing take" line.
POST_33_CHARS = 134_839

WARMUP_TEXT = "你好。"


def generate_line(model, text: str, **kwargs) -> tuple[np.ndarray, int]:
    """One sentence in, one waveform out (results concatenated if split)."""
    pieces = []
    sample_rate = None
    for result in model.generate(text=text, **kwargs):
        pieces.append(np.array(result.audio, dtype=np.float32))
        sample_rate = result.sample_rate
    if not pieces or sample_rate is None:
        raise RuntimeError(f"no audio for: {text}")
    return np.concatenate(pieces), sample_rate


def audition(model, label: str, lines: list[str], out: Path, **kwargs) -> dict:
    # Warm-up: the first call pays for compilation and would inflate the RTF.
    generate_line(model, WARMUP_TEXT, **kwargs)

    clips = []
    sample_rate = None
    started = time.perf_counter()
    for index, line in enumerate(lines, start=1):
        mx.random.seed(SEED)
        audio, sample_rate = generate_line(model, line, **kwargs)
        clips.append(audio)
        print(f"    {index}/{len(lines)} {len(audio) / sample_rate:5.1f}s  {line}")
    elapsed = time.perf_counter() - started

    gap = np.zeros(int(GAP_SECONDS * sample_rate), dtype=np.float32)
    joined = np.concatenate([part for clip in clips for part in (clip, gap)][:-1])
    path = out / f"{label}.wav"
    wavfile.write(path, sample_rate, np.clip(joined, -1.0, 1.0))

    speech_seconds = sum(len(clip) for clip in clips) / sample_rate
    chars = sum(len(line) for line in lines)
    return {
        "label": label,
        "file": path.name,
        "audio_seconds": speech_seconds,
        "elapsed_seconds": elapsed,
        "rtf": elapsed / speech_seconds,
        "chars_per_second": chars / speech_seconds,
    }


def run_qwen(lines: list[str], out: Path, voices: list[str] | None) -> list[dict]:
    print(f"\n== {QWEN}")
    model = load_model(QWEN)
    dialect = model.config.talker_config.spk_is_dialect or {}
    if voices:
        # `--voices` may also carry Breeze keys; keep only names this model has.
        known = {speaker.lower() for speaker in model.supported_speakers}
        speakers = [voice for voice in voices if voice.lower() in known]
    else:
        speakers = [
            speaker for speaker in model.supported_speakers if not dialect.get(speaker)
        ]
    print(f"  speakers in this model: {', '.join(model.supported_speakers)}")
    skipped = [speaker for speaker in model.supported_speakers if dialect.get(speaker)]
    if skipped and not voices:
        print(f"  skipping dialect speakers: {', '.join(skipped)}")

    rows = []
    for speaker in speakers:
        print(f"  voice: {speaker}")
        rows.append(
            audition(
                model,
                f"qwen3__{speaker}",
                lines,
                out,
                voice=speaker,
                lang_code="chinese",
            )
        )
    del model
    gc.collect()
    mx.clear_cache()
    return rows


def run_breeze(lines: list[str], out: Path, voices: list[str] | None) -> list[dict]:
    print(f"\n== {BREEZE}")
    model = load_model(BREEZE)
    rows = []
    for name, description in BREEZE_VOICES.items():
        if voices and name not in voices:
            continue
        print(f"  voice: {name} — {description}")
        rows.append(
            audition(
                model,
                f"breeze__{name}",
                lines,
                out,
                instruct=description,
                cfg_scale=BREEZE_CFG_SCALE,
                seed=SEED,
            )
        )
    del model
    gc.collect()
    mx.clear_cache()
    return rows


def write_report(rows: list[dict], lines: list[str], out: Path) -> None:
    table = [
        "| file | audio | generation | RTF | chars/s | post 33 estimate |",
        "|---|---|---|---|---|---|",
    ]
    for row in rows:
        post_audio_hours = POST_33_CHARS / row["chars_per_second"] / 3600
        post_generation_hours = post_audio_hours * row["rtf"]
        table.append(
            f"| `{row['file']}` | {row['audio_seconds']:.1f}s"
            f" | {row['elapsed_seconds']:.1f}s | {row['rtf']:.2f}"
            f" | {row['chars_per_second']:.1f}"
            f" | ~{post_audio_hours:.1f}h audio, ~{post_generation_hours:.1f}h to generate |"
        )
    body = "\n".join(
        [
            "# TTS audition",
            "",
            "RTF is generation time divided by audio length, measured after a",
            "warm-up call; below 1 is faster than real time. The post 33 estimate",
            f"scales this run's speaking rate and RTF to {POST_33_CHARS:,} characters.",
            "",
            *table,
            "",
            "## Lines",
            "",
            *[f"{index}. {line}" for index, line in enumerate(lines, start=1)],
            "",
        ]
    )
    (out / "report.md").write_text(body, encoding="utf-8")
    print("\n" + "\n".join(table))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--text-file", type=Path, help="one sentence per line")
    parser.add_argument("--out", type=Path, default=Path("tts-audition-out"))
    parser.add_argument(
        "--models",
        default="qwen,breeze",
        help="comma-separated: qwen, breeze (default: both)",
    )
    parser.add_argument(
        "--voices",
        help="comma-separated speaker names (Qwen) or voice keys (Breeze); "
        "default: every non-dialect Qwen speaker and every Breeze voice",
    )
    args = parser.parse_args()

    lines = DEFAULT_LINES
    if args.text_file:
        lines = [
            line.strip()
            for line in args.text_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    models = {name.strip() for name in args.models.split(",")}
    voices = [voice.strip() for voice in args.voices.split(",")] if args.voices else None

    args.out.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    if "qwen" in models:
        rows += run_qwen(lines, args.out, voices)
    if "breeze" in models:
        rows += run_breeze(lines, args.out, voices)

    write_report(rows, lines, args.out)
    print(f"\nWrote {len(rows)} files and report.md to {args.out.resolve()}")


if __name__ == "__main__":
    main()
