/**
 * Annual fairs and events.
 *
 * The reason this is its own section rather than a page of listings: an events
 * page is the fastest-rotting thing on any local site. It is written once in
 * March, it is wrong by September, and nobody notices because a date in the
 * past still looks like content.
 *
 * Two decisions keep this one honest, both inherited from recurrence.ts:
 *
 *   1. The RULE and the DATE are separate claims. "Third weekend in August" is
 *      something the organiser publishes; "15–17 August 2026" is arithmetic we
 *      did. A computed date says so on the page.
 *
 *   2. Confirmed dates for a specific year always beat the rule. When we have
 *      rung the organiser or read their own calendar, that is what shows.
 *
 * In practice the research found something worth stating: of the events here,
 * NONE publishes a recurring rule. Every one announces dates a year at a time.
 * So most records are `announced` plus a confirmed year — which means the page
 * goes quiet rather than wrong once that year passes, and the call sheet grows
 * an item instead of the site growing a lie.
 */
import { type Photo } from "./parks";
import {
  next as nextOccurrence,
  occurrenceLabel,
  type Recurrence,
} from "./recurrence";
import { isPublishable, tierOf, type Tier } from "./verification";

export interface FieldEvent {
  slug: string;
  name: string;
  /** "69th Annual", where the organiser numbers them. */
  edition: string | null;
  town: string;
  /** Where it actually happens, in words. */
  venue: string | null;
  address: string | null;
  blurb: string;
  /** When it recurs. `announced` where the organiser publishes no pattern. */
  rule: Recurrence;
  /** year → the dates we have actually confirmed. Always beats the rule. */
  confirmed: Record<string, { start: string; end?: string }>;
  admission: { note: string; amount: number | null };
  website: { label: string; url: string } | null;
  warnings: string[];
  photos?: Photo[];
  sources: { label: string; url: string; note?: string | null }[];
  sourcedOn: string | null;
  verifiedDate: string | null;
  verifiedSource: string | null;
  outstanding?: string[];
}

export interface DatedEvent {
  event: FieldEvent;
  label: ReturnType<typeof occurrenceLabel>;
  /** Sort key. Events with no known date go last, not first. */
  sortAt: number;
  tier: Tier;
}

/**
 * Decorate and order.
 *
 * Sorted by when the next occurrence starts, so the page reorders itself as
 * the year turns without anyone editing it. Undated events sort last: they are
 * still worth listing — that IS the honest state — but they should not head a
 * page whose job is telling you what's on soon.
 */
export function upcoming(events: FieldEvent[], today = new Date()): DatedEvent[] {
  return events
    .filter(isPublishable)
    .map((event) => {
      const occ = nextOccurrence(event.rule, event.confirmed, today);
      return {
        event,
        label: occurrenceLabel(event.rule, event.confirmed, today),
        sortAt: occ ? occ.start.getTime() : Number.MAX_SAFE_INTEGER,
        tier: tierOf(event),
      };
    })
    .sort((a, b) => a.sortAt - b.sortAt || a.event.name.localeCompare(b.event.name));
}

/** How many have dates we can actually point at. Shown on the index. */
export function datedCount(rows: DatedEvent[]): number {
  return rows.filter((r) => r.label.state !== "unknown").length;
}
