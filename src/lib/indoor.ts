/**
 * Museums, science centers and libraries — the indoor section.
 *
 * WHY THESE THREE THINGS SHARE ONE DATASET
 *
 * They have almost nothing in common as institutions. A county historical
 * society, a state-run nature center and a five-branch public library are
 * different animals with different funders and different reasons to exist.
 *
 * They are one section because of the question that brings people here, which
 * is not "what museums are there" but "it's raining and I have a seven-year-old
 * in a rental house." Everything in this file is somewhere warm and dry that
 * you can walk into. The rest of the site answers where to go when the weather
 * is good; this answers the other half, and the other half is roughly a third
 * of the days in a Garrett County year.
 *
 * WHY HOURS ARE THE HEADLINE FIELD
 *
 * Parks are open. These are not. Every record here can be closed on the day
 * you drive to it, and the failure is total — you arrive, the door is locked,
 * the trip is over. So `hours` leads every card the way `restrooms` leads a
 * town park, and a null renders as "Not confirmed" with the phone number
 * beside it rather than as an implied welcome.
 *
 * Seasonal closure is the specific trap. The transportation museum is shut
 * from Autumn Glory until May, which no aggregator listing mentions, and its
 * own site says so in one line on one page.
 */
import type { Correction, FieldNote, FieldReport, Photo, Verdict } from "./parks";

/** What kind of thing it is. Shown to the reader, so it reads as English. */
export type IndoorKind =
  /* A working farm with a heated indoor arena is not a museum and not a
     nature center, and it is the only place in the county where a small child
     can ride under a roof in February. It earns its own word. */
  | "Riding stable"
  | "Museum"
  | "Nature center"
  | "Library"
  | "Historic site"
  | "Gallery";

/**
 * Opening hours, in the two shapes these actually come in.
 *
 * `lines` is a day-by-day list because that is how every one of these bodies
 * publishes them, and flattening "Mon & Wed 9:15–8, Tue/Thu/Fri 9:15–5:30,
 * Sat 9–4" into one sentence loses the thing you needed. `note` carries what
 * doesn't fit a grid: holiday closures, festival closures, volunteer-dependent
 * opening.
 */
export interface Hours {
  /** e.g. { days: "Wed – Sat", text: "10:00am – 3:00pm" } */
  lines: { days: string; text: string }[] | null;
  /** Season, when the place has one. null means open year round, as published. */
  season: string | null;
  /** Anything that qualifies the grid above. */
  note: string | null;
}

/**
 * A library branch.
 *
 * Branches are not separate records. Five pages that each say "part of the
 * Ruth Enlow Library of Garrett County" would bury the one fact a reader wants
 * — which of these is open right now — under five sets of identical boilerplate
 * about the library system. One record, five sets of hours, one table.
 */
export interface Branch {
  name: string;
  town: string;
  address: string;
  phone: string | null;
  hours: Hours;
  /** Where the branch isn't where the address says. Renovations, temporary sites. */
  note: string | null;
}

export interface IndoorPlace {
  slug: string;
  name: string;
  kind: IndoorKind;
  /** Who runs it. A historical society and a state agency keep hours differently. */
  operator: string;
  town: string;
  address: string | null;
  blurb: string;
  hours: Hours;
  /** `free: true` is a real claim and needs a source like any other. */
  admission: { note: string; free: boolean | null; amount: number | null };
  phone: string | null;
  website: { label: string; url: string } | null;

  /* The indoor equivalents of the park facility questions. `null` is
     unconfirmed everywhere and never renders as "no". */
  restrooms: boolean | null;
  giftShop: boolean | null;
  /** Free-text: "step-free entrance, ADA restrooms" beats a boolean here. */
  accessibility: string | null;
  parking: string | null;
  /** What is actually inside. The reason to drive there. */
  inside: string[];

  /** Libraries only. Everything else leaves this null. */
  branches?: Branch[] | null;

  warnings: string[];
  sources: { label: string; url: string; note?: string | null; primary?: boolean }[];
  sourcedOn: string | null;
  verifiedDate: string | null;
  verifiedSource: string | null;
  outstanding?: string[];
  photos?: Photo[];
  corrections?: Correction[];
  reports?: FieldReport[];
  fieldNotes?: FieldNote[];
  verdict?: Verdict;
}

/* ------------------------------------------------------------- readers -- */

export interface Answer {
  text: string;
  state: "yes" | "no" | "unknown";
}

/** The one-line hours answer for a card. Deliberately refuses to guess. */
export function hoursAnswer(h: Hours): Answer {
  if (!h.lines || h.lines.length === 0) {
    return { text: "Not confirmed — call first", state: "unknown" };
  }
  const first = h.lines.map((l) => `${l.days} ${l.text}`).join(" · ");
  return { text: first, state: "yes" };
}

export function admissionAnswer(a: IndoorPlace["admission"]): Answer {
  if (a.free === true) return { text: a.note || "Free", state: "yes" };
  if (a.free === false) return { text: a.note, state: "no" };
  return { text: a.note || "Not confirmed", state: "unknown" };
}

const YES_NO = (v: boolean | null | undefined, yes: string, no: string): Answer =>
  v === true ? { text: yes, state: "yes" }
    : v === false ? { text: no, state: "no" }
      : { text: "Not confirmed", state: "unknown" };

export const restroomAnswer = (p: IndoorPlace) => YES_NO(p.restrooms, "Yes", "None");
export const giftShopAnswer = (p: IndoorPlace) => YES_NO(p.giftShop, "Yes", "None");

/**
 * How much of a record is actually known, shown as n/total on every card.
 *
 * Same reasoning as the parks table: a visible 4/9 is a real gap someone can
 * close, where a page that just omits the five unknown fields looks complete
 * and quietly isn't.
 */
export function completeness(p: IndoorPlace): { known: number; total: number } {
  const fields: unknown[] = [
    p.hours.lines,
    p.admission.free,
    p.address,
    p.phone,
    p.restrooms,
    p.giftShop,
    p.accessibility,
    p.parking,
    p.inside.length > 0 ? true : null,
  ];
  return {
    known: fields.filter((f) => f !== null && f !== undefined).length,
    total: fields.length,
  };
}

/** Feature chips for a card. Only true things appear — never "no restrooms". */
export interface Tag {
  key: string;
  label: string;
  emphasis: boolean;
}

/**
 * Same shape the park datasets return, so one <Tag> renders all of them and a
 * chip means the same thing whichever section a reader is in. Restrooms is the
 * emphasised one here too — indoors or out, it's the question that decides
 * whether a trip works.
 */
export function present(p: IndoorPlace): Tag[] {
  const out: Tag[] = [];
  const t = (key: string, label: string, emphasis = false) => out.push({ key, label, emphasis });
  if (p.admission.free === true) t("free", "Free");
  if (p.restrooms === true) t("restrooms", "Restrooms", true);
  if (p.giftShop === true) t("giftShop", "Gift shop");
  if (p.accessibility) t("accessible", "Accessibility noted");
  if (p.branches && p.branches.length > 1) t("branches", `${p.branches.length} branches`);
  return out;
}

/**
 * The reader-facing open questions, derived from what's null.
 *
 * Not hand-written per record. A list someone maintains by hand goes stale the
 * moment a field gets filled and then lies about what's missing.
 */
export function asks(p: IndoorPlace): string[] {
  const q: string[] = [];
  if (!p.hours.lines) q.push("What days and hours is it actually open?");
  if (p.admission.free === null) q.push("Does it cost anything to get in?");
  if (p.restrooms === null) q.push("Are there restrooms?");
  if (p.parking === null) q.push("Where do you park?");
  if (!p.accessibility) q.push("Is it step-free, and are the restrooms accessible?");
  if (p.hours.season === null && p.kind === "Museum") {
    q.push("Is it open year round, or does it close for the winter?");
  }
  return q;
}
