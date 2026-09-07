# `next dev` corrupts `prerender-manifest.json` under concurrent compiles

**Status:** written up for vercel/next.js, not yet filed. Reproduced against
Next 16.3.0 (Turbopack), React 19.2.8.

This is the write-up for an upstream report. It lives in the repo because the
finding cost a lot to reach and the file names and line numbers are the part
that decays — see `AGENTS.md` for how it reaches us, and
`e2e/helpers/warmup.ts` for the mitigation we took.

---

## What happens

`next dev` maintains `.next/dev/prerender-manifest.json` with an
unsynchronised read-modify-write, in
`next/dist/server/dev/next-dev-server.js` (≈ lines 660-690):

```js
const rawExistingManifest = await fs.promises.readFile(
  join(this.distDir, PRERENDER_MANIFEST), 'utf8',
);
const existingManifest = JSON.parse(rawExistingManifest);

for (const staticPath of value.staticPaths || []) {
  existingManifest.routes[staticPath] = {};
}
existingManifest.dynamicRoutes[pathname] = { /* … */ };

const updatedManifest = JSON.stringify(existingManifest);
if (updatedManifest !== rawExistingManifest) {
  await fs.promises.writeFile(
    join(this.distDir, PRERENDER_MANIFEST), updatedManifest,
  );
}
```

It runs once per dynamic route whose `generateStaticParams` resolves. There is
an `await` between every step and no lock, so two routes resolving close
together interleave. The write is a plain `fs.promises.writeFile`.

## Why it corrupts rather than merely losing an update

A lost update would be benign here. The damage is that the file is left
syntactically invalid, and the same function's `JSON.parse` on the next route
then throws.

Two writers open the file with `O_TRUNC` independently and write at their own
offsets. If writer A is producing 3,700 bytes and writer B 2,035, the file can
end as B's complete JSON followed by the remainder of A's — valid JSON, then
bytes:

```
SyntaxError: Unexpected non-whitespace character after JSON at position 2035
                                                     (line 1 column 2036)
    at JSON.parse (<anonymous>) {
  page: '/zh-hant/members/login'
}
```

The offset is the shorter write's length. A reader landing mid-write instead
sees a prefix and gets `Unexpected end of JSON input`. We have observed both.

## Impact

The throw propagates to whatever request is in flight — it is attributed to a
`page` that has nothing to do with the route being compiled — and takes the
response down with it. In our CI it most often kills `POST /api/users/login`,
so test fixtures cannot sign in and 20-30 unrelated specs fail in the same
shard for reasons that have nothing to do with themselves.

Measured on one pull request: **192-316 copies of the error per shard, four of
five shards red, and green on re-run.** The failure is invisible in the test
output — nothing names the manifest — so it reads as "this branch broke
everything".

Development only. A built server never rewrites these manifests.

## Reproducing

Any app where several dynamic routes resolve `generateStaticParams` at once
will do. Ours makes it easy because every route lives under a `[lang]` root
segment and is therefore dynamic:

1. `next dev`
2. Request four or more distinct dynamic routes concurrently against a cold
   `.next`
3. Watch the dev server's own stdout

It is probabilistic. Serialising those requests makes it rare; it does not
make it impossible, because ordinary navigation still compiles routes.

## Suggested fix

Next already ships exactly the right primitive and uses it for other
manifests — `next/dist/lib/fs/write-atomic.js`:

```js
function writeFileAtomic(filePath, content) {
  const tempPath = filePath + '.tmp.' + Math.random().toString(36).slice(2);
  try {
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, filePath);
  } catch (e) { /* … */ }
}
```

`shared/lib/turbopack/manifest-loader.js` calls it. This call site does not.
Using it here would remove the torn read, since `rename` is atomic — readers
see either the old file or the new one.

That alone does not remove the lost update: two routes can still read the same
base and each write a version missing the other's entry. If that matters, the
read-modify-write needs a mutex or a queue per manifest path. But the crash —
which is the part that takes down unrelated requests — is fixed by the atomic
write.
