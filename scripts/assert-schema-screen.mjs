#!/usr/bin/env node
/**
 * Every field a collection *requires* must have a control on the screen a
 * member uses to fill it.
 *
 * WHY THIS EXISTS. `posts.slug` is `required` and `unique`. A member cleared
 * it, clicked 發布, and the save was refused — correctly, and with a message
 * on screen. Two people walked that flow before anyone read the collection:
 * one grepped the page for the wrong words and concluded the app said nothing,
 * the other never looked at `post-message` at all. The field definition was
 * two lines long and would have answered it immediately.
 *
 * So the rule this enforces is not "check when something breaks". It is:
 * **before testing a form, read the schema and pair every required field with
 * its element.** A pairing that cannot be made is a bug by construction — the
 * member is being asked for something the interface never offers, and no
 * amount of clicking will find it.
 *
 * Static on purpose. It needs no database and no browser, so it runs in the
 * `checks` job in seconds rather than behind a browser suite, and a missing
 * control is reported by name instead of as a save that mysteriously fails.
 *
 * TWO DIRECTIONS, and both matter:
 *
 *   1. a required field with no entry in MAPPINGS  → someone added a
 *      requirement without a way to satisfy it
 *   2. an entry whose testid is absent from the UI → someone renamed or
 *      removed the control, leaving the requirement unfillable
 *
 * The mapping is written out rather than inferred from names because the
 * honest pairs are not always obvious: `content` is edited through
 * `editor-content`, which lives in a different component entirely. Writing
 * them down is the point — it is the artefact that was missing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

/**
 * collection file → { screens: [files that render its editor],
 *                     fields: { <schema field>: <data-testid> } }
 *
 * Add a collection here when it grows a member-facing form. An admin-only
 * collection does not belong: Payload generates that UI from the same schema,
 * so the pairing cannot drift.
 */
/**
 * `mode` matters, and getting it wrong in either direction makes this check
 * lie. A **create** screen must offer every required field: the row does not
 * exist yet, so anything missing cannot already be satisfied. An **update**
 * screen need not, because the value was set when the row was created —
 * `authors.slug` is required and the profile form has no control for it, and
 * that is correct: the form only PATCHes an author the invite flow already
 * made. Marking that screen `create` would demand a control nobody should
 * have; marking a create screen `update` would silence the very failure this
 * exists to catch. Exemptions are listed with their reason so the next reader
 * does not have to re-derive it.
 */
const MAPPINGS = [
  {
    collection: "src/collections/Posts.ts",
    mode: "create",
    screens: [
      "src/components/members/posts/PostEditor.tsx",
      "src/components/members/posts/RaceRecordField.tsx",
      // Lexical lives outside the posts folder — the file a
      // name-based guess would never find, which is why this check
      // caught its own first mapping being wrong.
      "src/components/members/editor/ContentEditor.tsx",
    ],
    fields: {
      title: "post-title",
      slug: "post-slug",
      description: "post-description",
      // Lexical, in its own component — the pair a name-based guess misses.
      content: "editor-content",
    },
  },
  {
    // The manager creates a record from three selects, so all three must be
    // there — this is the screen behind the M-RACES journey.
    collection: "src/collections/RaceRecords.ts",
    mode: "create",
    screens: ["src/components/members/races/RaceRecordManager.tsx"],
    fields: {
      eventId: "race-event-select",
      distanceId: "race-distance-select",
      year: "race-year-select",
    },
  },
  {
    collection: "src/collections/Authors.ts",
    mode: "update",
    screens: ["src/components/members/profile/ProfileForm.tsx"],
    fields: { name: "profile-author-name" },
    exempt: {
      slug: "Set when the invite flow creates the author. The profile form " +
        "only PATCHes /api/authors/<id>, so a member never supplies it.",
    },
  },
  {
    collection: "src/collections/Media.ts",
    mode: "update",
    screens: ["src/components/members/media/MediaDetailDialog.tsx"],
    fields: { alt: "media-detail-alt" },
  },
];

/** Field names carrying `required: true`, read from the collection source. */
function requiredFields(source) {
  const names = [];
  const re = /name:\s*'([a-zA-Z_]+)'/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const next = source.indexOf("name: '", match.index + 1);
    const block = source.slice(
      match.index,
      next === -1 ? source.length : next,
    );
    // `required` inside an `admin:` or nested block would be a false positive;
    // this only accepts it at the field's own indentation, which is how every
    // field in this repo is written.
    if (/\n\s{6}required: true/.test(block)) {
      names.push(match[1]);
    }
  }
  return [...new Set(names)];
}

let failures = 0;
const report = (line) => console.log(line);

/**
 * Every `getByTestId` a test uses must name something the app renders.
 *
 * A guessed selector is a contradiction: a test asserts a definite outcome,
 * and a locator nobody verified asserts whatever the guess happened to be.
 * One was written today — `race-report-start-error`, where the component says
 * `race-report-error` — and it failed as "element not found", which reads
 * exactly like a broken feature. That is the expensive part: a wrong selector
 * and a real regression are indistinguishable from the output.
 *
 * Constructed ids cannot be found by reading, so they are listed with the
 * expression that builds them. The list is the evidence that somebody looked.
 */
const CONSTRUCTED = {
  "member-nav-posts":
    'MemberNav.tsx: data-testid={`member-nav-${item.href.split("/").pop()}`}',
  "member-nav-races":
    'MemberNav.tsx: data-testid={`member-nav-${item.href.split("/").pop()}`}',
  "member-nav-media":
    'MemberNav.tsx: data-testid={`member-nav-${item.href.split("/").pop()}`}',
  "member-nav-profile":
    'MemberNav.tsx: data-testid={`member-nav-${item.href.split("/").pop()}`}',
  "member-nav-members":
    'MemberNav.tsx: data-testid={`member-nav-${item.href.split("/").pop()}`}',
};

function checkTestIds() {
  const specs = readdirSync("e2e", { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `e2e/${f}`)
    .filter((f) => existsSync(f) && statSync(f).isFile());

  const referenced = new Set();
  for (const file of specs) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/getByTestId\("([^"]+)"\)/g)) {
      referenced.add(m[1]);
    }
    for (const m of text.matchAll(/data-testid="([^"]+)"/g)) {
      referenced.add(m[1]);
    }
  }

  const rendered = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => `src/${f}`)
    .filter((f) => existsSync(f) && statSync(f).isFile())
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  for (const id of [...referenced].sort()) {
    if (rendered.includes(`data-testid="${id}"`)) continue;
    if (CONSTRUCTED[id]) {
      report(`  --  ${id} built at runtime — ${CONSTRUCTED[id]}`);
      continue;
    }
    failures += 1;
    report(
      `FAIL a test asks for data-testid="${id}", which nothing in src/ ` +
        `renders. Read the component; do not guess a selector.`,
    );
  }
  report(`  ok  ${referenced.size} testid(s) referenced by tests all exist`);
}

checkTestIds();

for (const entry of MAPPINGS) {
  const source = readFileSync(entry.collection, "utf8");
  const required = requiredFields(source);
  // A listed screen that does not exist is itself a finding: the mapping is
  // pointing at a component somebody moved.
  const missingScreens = entry.screens.filter((file) => !existsSync(file));
  const screens = entry.screens
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  for (const file of missingScreens) {
    failures += 1;
    report(
      `FAIL ${entry.collection}: MAPPINGS lists screen ${file}, which does ` +
        `not exist. A mapping pointing at a moved component checks nothing.`,
    );
  }

  for (const field of required) {
    if (entry.exempt && field in entry.exempt) {
      report(`  --  ${field} exempt (${entry.mode}): ${entry.exempt[field]}`);
      continue;
    }
    const testid = entry.fields[field];
    if (!testid && entry.mode === "update") {
      // An update screen that does not submit this field is fine; saying so
      // out loud is not, unless the reason is written down.
      failures += 1;
      report(
        `FAIL ${entry.collection}: '${field}' is required and this screen is ` +
          `mode "update" with no mapping and no exempt entry. Add the control, ` +
          `or record why a member never supplies it.`,
      );
      continue;
    }
    if (!testid) {
      failures += 1;
      report(
        `FAIL ${entry.collection}: '${field}' is required but has no entry in ` +
          `MAPPINGS — either give the member a control for it, or the field ` +
          `should not be required.`,
      );
      continue;
    }
    if (!screens.includes(`data-testid="${testid}"`)) {
      failures += 1;
      report(
        `FAIL ${entry.collection}: '${field}' is required and maps to ` +
          `data-testid="${testid}", which no screen renders. The member ` +
          `cannot satisfy it.`,
      );
      continue;
    }
    report(`  ok  ${field} → data-testid="${testid}"`);
  }

  // The reverse direction: a mapping for a field that is no longer required
  // is stale, and stale mappings are how this check quietly stops meaning
  // anything.
  for (const field of Object.keys(entry.fields)) {
    if (!required.includes(field)) {
      failures += 1;
      report(
        `FAIL ${entry.collection}: MAPPINGS lists '${field}' but it is no ` +
          `longer required — remove it so this check keeps describing the ` +
          `schema as it is.`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`\nschema/screen: ${failures} problem(s)`);
  process.exit(1);
}
console.log(
  `schema/screen: ok (${MAPPINGS.length} collection(s), every required field has a control)`,
);
