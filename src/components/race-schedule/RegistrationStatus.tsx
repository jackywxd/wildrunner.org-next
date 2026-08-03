import type { SiteRaceScheduleEntry } from "@/lib/content-types";
import {
  REGISTRATION_TYPE_LABELS,
  registrationLabel,
  registrationState,
} from "@/lib/races/registration";
import { cn } from "@/lib/utils";

/**
 * The registration state of one race, plus the link to act on it.
 *
 * Open registration is the most actionable thing on the page, so it gets
 * the loudest treatment the design system has — a filled block — while
 * everything that is over is muted. `registrationLabel` decides *how loud*
 * and this file decides *what loud looks like*, which keeps the visual
 * decision in one place and out of the pure logic module.
 *
 * The state is derived from dates on every render (the page is
 * force-dynamic), so nothing here goes stale at midnight.
 */

const TONE_CLASS = {
  muted: "border-border bg-transparent text-muted-foreground",
  outline: "border-primary bg-transparent text-primary",
  strong: "border-primary bg-primary text-primary-foreground font-semibold",
} as const;

export function RegistrationStatus({
  className,
  entry,
  now,
}: {
  className?: string;
  entry: SiteRaceScheduleEntry;
  now: Date;
}) {
  const state = registrationState(entry, now);
  const label = registrationLabel(state);

  // The link is only offered while it can still be acted on. Sending
  // somebody to a closed entry form reads as a bug, not as information.
  const actionable = state.kind === "open" || state.kind === "upcoming";
  const href = entry.registrationUrl || entry.url;

  const stateKey = state.kind === "override" ? state.value : state.kind;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-registration-state={stateKey}
      data-testid="race-registration"
    >
      <span
        className={cn(
          "inline-block border px-2 py-0.5 text-[11px] leading-tight",
          TONE_CLASS[label.tone],
        )}
      >
        {label.text}
      </span>

      {/* A lottery that says only "報名中" misleads — the entrant has to
          enter a draw, not pay a fee. Shown for every non-default type. */}
      {entry.registrationType !== "first-come" && (
        <span className="text-[11px] text-muted-foreground">
          {REGISTRATION_TYPE_LABELS[entry.registrationType]}
        </span>
      )}

      {actionable && href && (
        <a
          className="text-[11px] font-medium text-primary underline underline-offset-2 hover:no-underline"
          data-testid="race-registration-link"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          前往報名 →
        </a>
      )}
    </div>
  );
}
