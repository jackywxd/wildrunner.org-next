import { eventsNamed, type MatchEvent } from "./match";
import { normalizeRaceName } from "./normalize";
import { splitEventName } from "./parse";

/**
 * UltraSignup names the catalogue should learn, from what members already
 * told us.
 *
 * Two kinds of evidence say "this UltraSignup event is that catalogue
 * event": a record a member placed by hand (its `ultrasignupTitle` is the
 * row's text, its `eventId` the member's pick), and an approved catalogue
 * request an admin linked to an event. Either one, turned into an alias,
 * means the next member's row matches without anyone placing it.
 *
 * A proposal is a suggestion for an admin to accept, never a write: the
 * catalogue is shared by every badge, and one member's mis-click accepted
 * blindly would place everyone's finishes on the wrong race. So the count
 * of members who agree is shown, and a name that two events are claimed
 * for is marked as a conflict rather than resolved by majority.
 *
 * A name the matcher already resolves is not proposed — by name or by an
 * existing alias, to one event or to several. Adding it again changes
 * nothing; adding it to a second event would make it ambiguous and stop
 * it matching anything.
 */

export type AliasEvidence =
  | { eventKey: string; kind: "record"; ultrasignupTitle: string }
  | { eventKey: string; eventName: string; kind: "request" };

export type AliasProposal = {
  /** The spelling to add, as UltraSignup prints it. */
  alias: string;
  /** Another event is proposed for the same name. */
  conflict: boolean;
  eventKey: string;
  /** The catalogue's own name for the event. */
  eventName: string;
  /** `normalizeRaceName(alias)`: proposals sharing it are one decision. */
  name: string;
  records: number;
  requests: number;
};

function ultrasignupEventName(evidence: AliasEvidence): string {
  return evidence.kind === "record"
    ? splitEventName(evidence.ultrasignupTitle).eventName
    : evidence.eventName.trim();
}

export function aliasProposals(events: MatchEvent[], evidence: AliasEvidence[]): AliasProposal[] {
  const catalogueNames = new Map(events.map((event) => [event.id, event.name]));
  type Tally = AliasProposal & { spellings: Map<string, number> };
  const tallies = new Map<string, Tally>();

  for (const item of evidence) {
    const eventName = catalogueNames.get(item.eventKey);
    if (eventName === undefined) continue;
    const spelling = ultrasignupEventName(item);
    const name = normalizeRaceName(spelling);
    if (!name || eventsNamed(events, spelling).length > 0) continue;

    const id = `${name}\u0000${item.eventKey}`;
    const tally: Tally = tallies.get(id) ?? {
      alias: spelling,
      conflict: false,
      eventKey: item.eventKey,
      eventName,
      name,
      records: 0,
      requests: 0,
      spellings: new Map(),
    };
    if (item.kind === "record") tally.records += 1;
    else tally.requests += 1;
    tally.spellings.set(spelling, (tally.spellings.get(spelling) ?? 0) + 1);
    tallies.set(id, tally);
  }

  const eventsPerName = new Map<string, number>();
  for (const tally of tallies.values()) {
    eventsPerName.set(tally.name, (eventsPerName.get(tally.name) ?? 0) + 1);
  }

  return [...tallies.values()]
    .map(({ spellings, ...proposal }) => ({
      ...proposal,
      // The spelling most of the evidence used; the first one seen on a tie.
      alias: [...spellings].reduce((best, next) => (next[1] > best[1] ? next : best))[0],
      conflict: (eventsPerName.get(proposal.name) ?? 0) > 1,
    }))
    .sort(
      (a, b) =>
        b.records + b.requests - (a.records + a.requests) ||
        a.name.localeCompare(b.name) ||
        a.eventKey.localeCompare(b.eventKey),
    );
}

/**
 * The alias text with `alias` appended, or null when an existing line
 * already normalises to the same name. Lines are kept as the admin wrote
 * them; only the new one is added.
 */
export function withAlias(current: string | null | undefined, alias: string): string | null {
  const lines = (current ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = normalizeRaceName(alias);
  if (lines.some((line) => normalizeRaceName(line) === name)) return null;
  return [...lines, alias.trim()].join("\n");
}
