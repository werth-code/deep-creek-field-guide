/**
 * Recurring dates, for annual fairs and events.
 *
 * THE DISTINCTION THIS FILE EXISTS FOR
 *
 * "The third weekend in August" is a FACT — the organizer publishes it, it
 * holds for years, and it can be verified once. "15–17 August 2026" is
 * ARITHMETIC performed on that fact. They are not the same kind of thing and
 * this site must not present them as if they were.
 *
 * It matters because the arithmetic can be right and the answer still wrong:
 * a fair that has run the third weekend in August for forty years can move to
 * the second weekend for one year because of a scheduling clash, and every
 * site that computed the date from the rule will confidently print the wrong
 * one. That is exactly the failure this whole project exists to avoid.
 *
 * So a computed date is labeled as computed, and a date we have actually
 * confirmed for a given year is stored per-year and always wins. The reader is
 * shown the rule and the date together, so a local who knows better can see
 * immediately which one we got wrong.
 *
 * `announced` is a first-class case, not an error. "Late July, dates published
 * each spring" is the honest state of many small-town events, and forcing it
 * into a fake date would be inventing a fact.
 */

/** 0 = Sunday, 6 = Saturday. Matches Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HolidayAnchor =
  | "memorial-day"      // last Monday in May
  | "independence-day"  // 4 July
  | "labor-day"         // first Monday in September
  | "columbus-day"      // second Monday in October
  | "veterans-day"      // 11 November
  | "thanksgiving";     // fourth Thursday in November

export type Recurrence =
  /** A calendar date that doesn't move. `days` spans forward from it. */
  | { kind: "fixed"; month: number; day: number; days?: number }
  /** "Third Saturday in August". `nth: -1` means the last one in the month. */
  | { kind: "nth-weekday"; month: number; weekday: Weekday; nth: number; days?: number }
  /** Hung off a public holiday, optionally shifted. */
  | { kind: "anchor"; anchor: HolidayAnchor; offsetDays?: number; days?: number }
  /** Genuinely not known yet. Renders as unknown — never as a guess. */
  | { kind: "announced"; hint: string };

export interface Occurrence {
  start: Date;
  end: Date;
  /** false when these dates were confirmed for this specific year. */
  computed: boolean;
}

/* --------------------------------------------------------------- maths -- */

/** nth weekday of a month. `nth = -1` means the last one. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  if (nth > 0) {
    const first = new Date(year, month - 1, 1);
    const shift = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month - 1, 1 + shift + (nth - 1) * 7);
  }
  /* Day 0 of the NEXT month is the last day of this one, and negative days
     count back from there. Writing this as `last.getDate() - shift` with the
     same month index silently lands in the following month. */
  const last = new Date(year, month, 0);
  const shift = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, 0 - shift);
}

export function resolveHoliday(anchor: HolidayAnchor, year: number): Date {
  switch (anchor) {
    case "memorial-day": return nthWeekday(year, 5, 1, -1);
    case "independence-day": return new Date(year, 6, 4);
    case "labor-day": return nthWeekday(year, 9, 1, 1);
    case "columbus-day": return nthWeekday(year, 10, 1, 2);
    case "veterans-day": return new Date(year, 10, 11);
    case "thanksgiving": return nthWeekday(year, 11, 4, 4);
  }
}

const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Resolve a recurrence for one year.
 *
 * `confirmed` is a map of year → actual dates we have verified. It always
 * wins, because the whole point is that a published rule and a published
 * calendar can disagree and the calendar is the one people turn up on.
 */
export function resolve(
  rec: Recurrence,
  year: number,
  confirmed?: Record<string, { start: string; end?: string }> | null,
): Occurrence | null {
  const pinned = confirmed?.[String(year)];
  if (pinned) {
    const start = fromISO(pinned.start);
    return { start, end: pinned.end ? fromISO(pinned.end) : start, computed: false };
  }

  if (rec.kind === "announced") return null;

  let start: Date;
  if (rec.kind === "fixed") start = new Date(year, rec.month - 1, rec.day);
  else if (rec.kind === "nth-weekday") start = nthWeekday(year, rec.month, rec.weekday, rec.nth);
  else start = addDays(resolveHoliday(rec.anchor, year), rec.offsetDays ?? 0);

  const span = Math.max(1, rec.days ?? 1);
  return { start, end: addDays(start, span - 1), computed: true };
}

/**
 * The next occurrence that hasn't finished yet.
 *
 * Looks at this year and the next two, so December still finds a February
 * event and an event whose rule has already passed rolls forward rather than
 * showing a date in the past — which is the single most common way an events
 * page rots.
 */
export function next(
  rec: Recurrence,
  confirmed?: Record<string, { start: string; end?: string }> | null,
  today = new Date(),
): Occurrence | null {
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let y = midnight.getFullYear(); y <= midnight.getFullYear() + 2; y++) {
    const occ = resolve(rec, y, confirmed);
    if (occ && occ.end >= midnight) return occ;
  }
  return null;
}

/* ------------------------------------------------------------- format -- */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL = ["", "first", "second", "third", "fourth", "fifth"];

/** Parsed by hand — `new Date(iso)` reads a bare date as UTC and shifts it. */
function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The RULE in words: "Third Saturday in August". */
export function describe(rec: Recurrence): string {
  const span = (n?: number) => (n && n > 1 ? `, ${n} days` : "");
  switch (rec.kind) {
    case "announced":
      return rec.hint;
    case "fixed":
      return `${rec.day} ${MONTHS[rec.month - 1]} each year${span(rec.days)}`;
    case "nth-weekday": {
      const which = rec.nth === -1 ? "Last" : (ORDINAL[rec.nth] ?? `${rec.nth}th`);
      const cap = which.charAt(0).toUpperCase() + which.slice(1);
      return `${cap} ${DAYS[rec.weekday]} in ${MONTHS[rec.month - 1]}${span(rec.days)}`;
    }
    case "anchor": {
      const name = rec.anchor.replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
      const off = rec.offsetDays ?? 0;
      const shift = off === 0 ? "" : off > 0 ? ` plus ${off} day${off > 1 ? "s" : ""}` : ` minus ${-off} day${off < -1 ? "s" : ""}`;
      return `${name}${shift}${span(rec.days)}`;
    }
  }
}

/** The DATES: "15–17 August 2026", or "15 August 2026" for a single day. */
export function formatOccurrence(occ: Occurrence): string {
  const { start, end } = occ;
  const sameDay = toISO(start) === toISO(end);
  if (sameDay) return `${start.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  const left = `${start.getDate()} ${MONTHS[start.getMonth()]}${sameYear ? "" : ` ${start.getFullYear()}`}`;
  return `${left} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

/** Days until it starts. Negative while it's running. */
export function daysUntil(occ: Occurrence, today = new Date()): number {
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((occ.start.getTime() - midnight.getTime()) / 86_400_000);
}

export function isRunning(occ: Occurrence, today = new Date()): boolean {
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return occ.start <= midnight && midnight <= occ.end;
}

/**
 * How to say it on a page, in one place so every surface agrees.
 *
 * `state` is what the caller styles on. `computed` is surfaced deliberately:
 * a date we worked out from a rule is a weaker claim than one we confirmed,
 * and the reader is entitled to know which they're looking at.
 */
export function occurrenceLabel(
  rec: Recurrence,
  confirmed?: Record<string, { start: string; end?: string }> | null,
  today = new Date(),
): { text: string; state: "running" | "upcoming" | "unknown"; computed: boolean; note: string | null } {
  const occ = next(rec, confirmed, today);
  if (!occ) {
    return {
      text: rec.kind === "announced" ? rec.hint : "Dates not confirmed",
      state: "unknown",
      computed: false,
      note: "The organizer hasn't published dates we can point at yet.",
    };
  }
  if (isRunning(occ, today)) {
    return { text: `On now — ${formatOccurrence(occ)}`, state: "running", computed: occ.computed, note: null };
  }
  const d = daysUntil(occ, today);
  const when = d === 0 ? "Today" : d === 1 ? "Tomorrow" : d <= 21 ? `In ${d} days` : null;
  return {
    text: when ? `${when} — ${formatOccurrence(occ)}` : formatOccurrence(occ),
    state: "upcoming",
    computed: occ.computed,
    note: occ.computed
      ? "Worked out from the usual pattern, not confirmed with the organizer for this year."
      : null,
  };
}
