/**
 * Static-asset module declarations, independent of `next-env.d.ts`.
 *
 * `next-env.d.ts` is what normally supplies these (via
 * `next/image-types/global`), but it is gitignored — Next regenerates it on
 * `next dev` / `next build`. So it exists on any machine that has run the
 * app and does not exist in a fresh CI checkout, which made `pnpm typecheck`
 * pass locally and fail in CI with
 *
 *   src/config/site.ts(1,26): error TS2307: Cannot find module
 *   '../../public/images/author/devbertskie.png'
 *
 * ...because typecheck deliberately runs before anything that would generate
 * it. Referencing the types package directly here needs only `node_modules`,
 * so typecheck no longer depends on build ordering.
 *
 * Deliberately not committing `next-env.d.ts` itself: its third line is
 * `/// <reference path="./.next/types/routes.d.ts" />`, a build artefact that
 * a fresh checkout also lacks, which would trade this error for a missing-file
 * one.
 */
/// <reference types="next/image-types/global" />

export {};
