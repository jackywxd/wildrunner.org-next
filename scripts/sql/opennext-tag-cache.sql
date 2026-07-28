-- OpenNext tag cache (revalidatePath / revalidateTag backing store).
--
-- Deliberately NOT a Payload migration: Payload generates its migrations by
-- diffing the collection schema, and a table it doesn't know about would be
-- dropped the next time one is generated. Applied out-of-band instead:
--
--   wrangler d1 execute wildrunner-org-next --remote \
--     --file scripts/sql/opennext-tag-cache.sql
--
-- Schema is dictated by @opennextjs/cloudflare's D1NextModeTagCache
-- (overrides/tag-cache/d1-next-tag-cache.js) — it writes
-- (tag, revalidatedAt, stale, expire) and reads back by tag.
CREATE TABLE IF NOT EXISTS revalidations (
  tag TEXT NOT NULL,
  revalidatedAt INTEGER NOT NULL,
  stale INTEGER,
  expire INTEGER
);

CREATE INDEX IF NOT EXISTS idx_revalidations_tag ON revalidations (tag);
