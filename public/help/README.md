# public/help — the member help page's pictures and clips

Everything here is used by `src/app/[lang]/(site)/members/(dashboard)/help/page.tsx`
(`/members/help`). `U-HELPASSETS` fails if the page names a file that is not here,
or if a file here is an LFS pointer instead of the real bytes.

## Why these are not in Git LFS

`.gitattributes` sends `*.png`, `*.webp`, `*.mp4` … to LFS, and every deploy checks
out with `lfs: false` (`.github/workflows/deploy.yml`, `docs/workers-builds.md`). An
LFS-tracked screenshot would reach the Worker as a 130-byte pointer file and draw as
a broken image. The `public/help/** -filter -diff -merge` line exempts this folder,
so keep it small: the whole folder was 5.8 MB when it was made (seven clips ≈ 5 MB).

## How they were made

- Local `pnpm dev` on the seeded corpus, signed in as the e2e member
  (`member@wildrunner.test`, `e2e/helpers/members.ts`) — an ordinary member, not an
  admin, so the member nav has no 「切換到管理後台」.
- Demo photos were drawn (layered mountains and a stick-figure runner), not real
  photographs of anyone.
- Playwright, 390×844, `isMobile` + `hasTouch`, light theme. A small init script drew
  a purple circle on every tap so a viewer can see what was pressed, and hid the
  dev-only overlays (Next's dev indicator, the Tailwind breakpoint badge).
- The seeded corpus's own images live on production R2, which the capture machine
  could not reach; in the screenshots those misses were filled with the demo scenes.
  Nothing in the database was changed for that.
- Stills: 2× PNG → WebP q78 (`sharp`). Clips: Playwright's `recordVideo` (WebM/VP8),
  no re-encode. Posters (`*-poster.webp`) are frames taken from the clips.
- Each clip opens on a few seconds of the page loading. With no encoder available the
  lead is skipped at playback instead: `HelpClip`'s `start` (a `#t=` media fragment).
  Measure the white lead again if a clip is re-recorded.

## When to retake

When a button, label or flow the page quotes changes. The page quotes labels as
plain text, so `grep` for the old wording finds both the component and the help.
