import { test, expect } from "@playwright/test";

import {
  REGISTRATION_TYPE_LABELS,
  externalHref,
  isRegistrationOpen,
  registrationLabel,
  registrationState,
} from "@/lib/races/registration";
import type { RegistrationType } from "@/lib/races/registration";

/**
 * Phase D — registration state.
 *
 * Plain Node, no browser. These branches are the reason no
 * `isRegistrationOpen` column exists: the state is recomputed on every
 * request, so it can never be stale — but it can be *wrong*, and the
 * boundary days are where that would happen.
 *
 * Getting a boundary wrong sends somebody away from a race they could still
 * enter, which is the worst outcome this feature has, so both ends are
 * pinned explicitly.
 */

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

test.describe("D registration state", () => {
  test("D-T1: no dates at all means unknown", () => {
    expect(registrationState({}, at("2026-08-01")).kind).toBe("unknown");
    expect(registrationLabel({ kind: "unknown" }).text).toBe("報名資訊待公布");
  });

  test("D-T2: before the window opens", () => {
    const state = registrationState(
      { registrationOpensAt: "2026-10-01" },
      at("2026-08-01"),
    );
    expect(state).toEqual({ kind: "upcoming", opensAt: "2026-10-01" });
    expect(registrationLabel(state).text).toBe("10月1日 開放報名");
    expect(registrationLabel(state).tone).toBe("outline");
  });

  test("D-T3: the opening day itself counts as open", () => {
    const entry = {
      registrationClosesAt: "2026-10-14",
      registrationOpensAt: "2026-10-01",
    };
    expect(isRegistrationOpen(entry, at("2026-10-01"))).toBeTruthy();
  });

  test("D-T4: the closing day itself counts as open", () => {
    // "closes 10/14" means 10/14 is your last day. Treating it as already
    // shut would turn people away a day early.
    const entry = {
      registrationClosesAt: "2026-10-14",
      registrationOpensAt: "2026-10-01",
    };
    expect(isRegistrationOpen(entry, at("2026-10-14"))).toBeTruthy();
    expect(registrationState(entry, at("2026-10-15")).kind).toBe("closed");
  });

  test("D-T5: an open window with a known end says so", () => {
    const state = registrationState(
      { registrationClosesAt: "2026-10-14", registrationOpensAt: "2026-10-01" },
      at("2026-10-05"),
    );
    expect(state).toEqual({ kind: "open", closesAt: "2026-10-14" });
    const label = registrationLabel(state);
    expect(label.text).toBe("報名中 · 至 10月14日");
    expect(label.tone).toBe("strong");
  });

  test("D-T6: an open date with no closing date stays open", () => {
    // The common real case: the organiser announced an opening date and
    // nothing else. Inventing a close would shut the race early.
    const state = registrationState(
      { registrationOpensAt: "2026-07-01" },
      at("2027-01-01"),
    );
    expect(state).toEqual({ kind: "open", closesAt: undefined });
    expect(registrationLabel(state).text).toBe("報名中");
  });

  test("D-T7: a closing date with no opening date is open until it passes", () => {
    const entry = { registrationClosesAt: "2026-12-01" };
    expect(isRegistrationOpen(entry, at("2026-08-01"))).toBeTruthy();
    expect(registrationState(entry, at("2026-12-02")).kind).toBe("closed");
  });

  test("D-T8: a manual override beats any date arithmetic", () => {
    const state = registrationState(
      {
        registrationClosesAt: "2026-10-14",
        registrationOpensAt: "2026-10-01",
        registrationStatusOverride: "full",
      },
      // Mid-window: the dates say open, the editor says full.
      at("2026-10-05"),
    );
    expect(state).toEqual({ kind: "override", value: "full" });
    expect(registrationLabel(state).text).toBe("報名額滿");
    expect(registrationLabel(state).tone).toBe("muted");
  });

  test("D-T9: waitlist is still actionable, so it is not greyed out", () => {
    const label = registrationLabel({ kind: "override", value: "waitlist" });
    expect(label.text).toBe("候補中");
    expect(label.tone).toBe("outline");
  });

  test("D-T11: every registration type has a label", () => {
    // A missing key renders literal "undefined" next to the status, which
    // reads as a bug to a visitor and would never fail a type check —
    // the map is keyed by a union, so an absent entry is a compile error
    // only if the map is declared as Record<RegistrationType, string>.
    // This pins the runtime side.
    const types: RegistrationType[] = [
      "first-come",
      "lottery",
      "qualifier",
      "invitational",
    ];
    for (const type of types) {
      expect(REGISTRATION_TYPE_LABELS[type]?.trim().length, type).toBeGreaterThan(0);
    }
  });

  test("D-T12: only absolute http(s) links are handed to the page", () => {
    // A bare domain in an href is *relative*: it resolves against our own
    // origin and lands on a 404 of this site. The collection rejects one
    // on write, but rows stored before that validator existed are never
    // re-validated, so the render path drops what it cannot use.
    expect(externalHref("https://hardrock100.com")).toBe("https://hardrock100.com");
    expect(externalHref("http://hardrock100.com")).toBe("http://hardrock100.com");

    expect(externalHref("hardrock100.com")).toBeUndefined();
    expect(externalHref("/races")).toBeUndefined();
    expect(externalHref("javascript:alert(1)")).toBeUndefined();
    expect(externalHref("ftp://hardrock100.com")).toBeUndefined();
    expect(externalHref("")).toBeUndefined();
    expect(externalHref(undefined)).toBeUndefined();

    // Falls through to the next candidate rather than giving up: this is
    // how a race with a broken registration link still offers its site.
    expect(externalHref("hardrock100.com", "https://hardrock100.com")).toBe(
      "https://hardrock100.com",
    );
    expect(externalHref(undefined, "https://hardrock100.com")).toBe(
      "https://hardrock100.com",
    );
    expect(externalHref("not-a-url", "also-not-a-url")).toBeUndefined();
  });

  test("D-T10: every state produces a non-empty label", () => {
    const states = [
      { kind: "unknown" },
      { kind: "upcoming", opensAt: "2026-10-01" },
      { kind: "open" },
      { kind: "closed", closedAt: "2026-10-14" },
      { kind: "override", value: "cancelled" },
    ] as const;

    for (const state of states) {
      const label = registrationLabel(state);
      expect(label.text.trim().length, `${state.kind} has no label`).toBeGreaterThan(0);
    }
  });
});
