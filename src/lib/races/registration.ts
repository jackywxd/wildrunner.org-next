/**
 * Whether a race is open for registration, derived rather than stored.
 *
 * There is deliberately no `isRegistrationOpen` column. A boolean would be
 * correct on the day it was written and wrong every day after, because
 * nobody goes back to the admin panel to flip it. Two dates plus the
 * current time answer the question exactly, and `/races` is `force-dynamic`
 * so the answer is recomputed on every request — the page turns over at
 * midnight without anything having to run.
 *
 * What dates cannot express is "full", "waitlist" and "cancelled". Those
 * come from `registrationStatusOverride`, which is why the override is
 * checked first: when an editor has said the race is full, no amount of
 * date arithmetic should contradict them.
 *
 * Same conventions as calendar.ts: `now` is a parameter, and comparisons
 * happen on "YYYY-MM-DD" strings, which order lexicographically in date
 * order. Nothing here parses a date into a `Date`.
 */

import { toDateString } from "./calendar";

export type RegistrationOverride = "full" | "waitlist" | "cancelled" | "tba";

export type RegistrationType =
  | "first-come"
  | "lottery"
  | "qualifier"
  | "invitational";

export type RegistrationState =
  /** No dates published yet. */
  | { kind: "unknown" }
  | { kind: "upcoming"; opensAt: string }
  | { kind: "open"; closesAt?: string }
  | { kind: "closed"; closedAt: string }
  | { kind: "override"; value: RegistrationOverride };

type RegistrationInput = {
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  registrationStatusOverride?: RegistrationOverride | null;
};

export function registrationState(
  entry: RegistrationInput,
  now: Date,
): RegistrationState {
  if (entry.registrationStatusOverride) {
    return { kind: "override", value: entry.registrationStatusOverride };
  }

  const opensAt = entry.registrationOpensAt || undefined;
  const closesAt = entry.registrationClosesAt || undefined;
  if (!opensAt && !closesAt) return { kind: "unknown" };

  const today = toDateString(now);

  // Boundaries are inclusive on both ends: a race whose window opens today
  // is open today, and one that closes today is still open today. Entrants
  // read "closes 8/28" as "8/28 is your last day", and being stricter than
  // the organiser would send them away a day early.
  if (opensAt && today < opensAt) return { kind: "upcoming", opensAt };
  if (closesAt && today > closesAt) return { kind: "closed", closedAt: closesAt };

  return { kind: "open", closesAt };
}

/** Convenience for the places that only need the yes/no. */
export function isRegistrationOpen(
  entry: RegistrationInput,
  now: Date,
): boolean {
  return registrationState(entry, now).kind === "open";
}

const OVERRIDE_LABELS: Record<RegistrationOverride, string> = {
  cancelled: "賽事取消",
  full: "報名額滿",
  tba: "報名資訊待公布",
  waitlist: "候補中",
};

export const REGISTRATION_TYPE_LABELS: Record<RegistrationType, string> = {
  "first-come": "先到先得",
  invitational: "邀請制",
  lottery: "抽籤制",
  qualifier: "需資格賽",
};

/**
 * The label and how loudly to say it.
 *
 * `tone` is an intent, not a colour — the component picks the classes. This
 * file has no opinion on what "strong" looks like, which is what keeps the
 * design decision in one place instead of two.
 */
export function registrationLabel(state: RegistrationState): {
  text: string;
  tone: "strong" | "outline" | "muted";
} {
  switch (state.kind) {
    case "open":
      return {
        text: state.closesAt
          ? `報名中 · 至 ${formatShort(state.closesAt)}`
          : "報名中",
        tone: "strong",
      };
    case "upcoming":
      return { text: `${formatShort(state.opensAt)} 開放報名`, tone: "outline" };
    case "closed":
      return { text: "報名已截止", tone: "muted" };
    case "override":
      return {
        text: OVERRIDE_LABELS[state.value],
        // "Waitlist" is still an action the visitor can take, so it keeps
        // the outline treatment rather than being greyed out with the
        // states that are genuinely over.
        tone: state.value === "waitlist" ? "outline" : "muted",
      };
    case "unknown":
      return { text: "報名資訊待公布", tone: "muted" };
  }
}

/** "2026-08-28" -> "8月28日". */
function formatShort(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}
