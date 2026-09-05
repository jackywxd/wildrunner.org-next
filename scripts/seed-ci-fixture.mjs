#!/usr/bin/env node
/**
 * Build the fixture corpus CI caches, and prove it is there.
 *
 * WHY CI HAS ITS OWN ENTRY POINT rather than calling `db:reset:local`: that
 * script *deletes* `.wrangler/state/v3/d1` first, which is right on a machine
 * carrying months of e2e residue and pointless in a container that starts
 * empty. It also asserts the 4 GB local R2 directory survives, which does not
 * exist here. What both share — the steps, their order, and reading the row
 * counts back — is in `lib/corpus.mjs` and is imported by both.
 *
 * THE VERIFICATION IS THE POINT, not a nicety. This runs on `main` to fill a
 * cache every pull request then reads, so a silent empty seed would not cost
 * one run: it would be saved under the key and served to every PR until an
 * input changed. `migrate:velite` has been seen exiting 0 having written
 * nothing — three times running on 2026-09-05 — so that is not hypothetical.
 */
import { runSeeds, verifyCorpus } from "./lib/corpus.mjs";

runSeeds("seed:ci");
verifyCorpus("seed:ci");
