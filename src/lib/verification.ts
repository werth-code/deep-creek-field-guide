/**
 * The verification gate.
 *
 * The convention is "a fact without both verifiedDate and verifiedSource does
 * not ship." That promise is worthless if it relies on remembering to keep it,
 * so it is enforced here rather than by discipline:
 *
 *   - No verifiedDate + verifiedSource  →  no verification stamp. Not possible.
 *   - No verifiedDate + verifiedSource  →  the page is `noindex`, and is
 *     dropped from sitemap.xml (see astro.config.mjs). An unfinished draft can
 *     never become the thing Google or an AI crawler cites.
 *   - Filling both fields in the JSON is the single switch that publishes it.
 *
 * Confirm the fact, fill in the two fields, done.
 */

import { formatStampDate } from "./dates";

export interface Verifiable {
  verifiedDate: string | null;
  verifiedSource: string | null;
  /**
   * Named sources. `primary: false` marks one that is NOT the body that sets
   * the rule — a community site, a tourism board, a guide.
   *
   * This flag exists because the gate could not previously tell the
   * difference. /how-we-verify/ promises that a fact whose only origin is an
   * aggregator never publishes, and the build enforced it by checking that
   * SOME source existed — which an aggregator satisfies. Five town-park
   * records were live on the strength of a community information site, and
   * one of them was wrong in a way that would have sent a family somewhere to
   * swim. A promise the build cannot check is not enforced, it is decoration.
   */
  sources?: { label: string; url: string; note?: string | null; primary?: boolean }[] | null;
  /** ISO date those sources were read. Required for a record to count as sourced. */
  sourcedOn?: string | null;
}

/**
 * THREE TIERS, NOT TWO.
 *
 * The original gate was binary: phone-confirmed or invisible. That was right
 * while there were five pages and wrong at sixty-eight — it left the whole
 * site unpublishable and made the calls a prerequisite rather than an upgrade.
 *
 *   confirmed — someone called, visited, or asked the body directly.
 *   sourced   — read from a named PRIMARY source: the city's own notice,
 *               DNREC's published schedule, the county's own listing.
 *   reported  — third-hand. An aggregator, a review site, a blog.
 *
 * Confirmed and sourced publish. **Reported never does**, and that is the line
 * that actually protects the site: /how-we-verify/ promises we don't source a
 * fact from another guide, and this is what enforces it. A dog park whose only
 * origin is a Google listing stays out of search until someone stands in it.
 *
 * The distinction is shown to the reader, not hidden — "the city publishes
 * this" and "we called and asked" are different claims and the stamp says
 * which one you're getting.
 */
export type Tier = "confirmed" | "sourced" | "reported";

export function tierOf(v: Verifiable): Tier {
  if (v.verifiedDate && v.verifiedSource) return "confirmed";
  /* At least one PRIMARY source. A record standing only on third-party
     write-ups is `reported`, and reported never publishes. */
  const primary = (v.sources ?? []).filter((s) => s.primary !== false);
  if (primary.length > 0 && v.sourcedOn) return "sourced";
  return "reported";
}

/* ------------------------------------------------------- confidence -- */

/**
 * The tier, said out loud.
 *
 * "confirmed / sourced / reported" is accurate and it is jargon. Nobody reading
 * a park page knows what tier two means. These are the same three states named
 * the way a person would say them, plus the fourth that never publishes.
 *
 * The rating is deliberately about CONFIDENCE rather than quality. Everyone
 * else rates how good a place is, which is an opinion anyone can have. How
 * sure I am, and why, is the thing this site can say that they can't.
 */
export const CONFIDENCE: Record<Tier, { label: string; means: string }> = {
  confirmed: {
    label: "Stood on it",
    means: "I went, or I called and asked the people who set the rule. Dated, and it says who.",
  },
  sourced: {
    label: "Off their page",
    means: "Taken from the official source and linked, but I haven't confirmed it myself.",
  },
  reported: {
    label: "Not checked",
    means: "Listed so you know it exists. Don't plan around it.",
  },
};

export const confidenceOf = (v: Verifiable) => CONFIDENCE[tierOf(v)];

/** True only for first-party confirmation. Used where the strong claim matters. */
export const isVerified = (v: Verifiable): boolean => tierOf(v) === "confirmed";

/** Confirmed or sourced. Reported stays out of search. */
export const isPublishable = (v: Verifiable): boolean => tierOf(v) !== "reported";

export const robotsFor = (v: Verifiable): string =>
  isPublishable(v)
    ? "index, follow, max-snippet:-1, max-image-preview:large"
    : "noindex, nofollow";

/** "Verified 6 Aug 2026 · City of Rehoboth Beach, by phone" */
export function stampText(v: Verifiable): string | null {
  if (!isVerified(v)) return null;
  return `Verified ${formatStampDate(v.verifiedDate!)} · ${v.verifiedSource}`;
}

/**
 * The stamp for a sourced record. Deliberately worded so it cannot be mistaken
 * for confirmation — "read from" is doing real work here.
 */
export function sourcedText(v: Verifiable): string | null {
  if (tierOf(v) !== "sourced") return null;
  const from = v.sources![0].label;
  return `Read from ${from} on ${formatStampDate(v.sourcedOn!)} · not yet confirmed by phone`;
}

/** `null` means unverified, never "no". Spec convention, used across renderers. */
export const orNotConfirmed = (value: unknown): string =>
  value === null || value === undefined || value === "" ? "Not confirmed" : String(value);

/* ------------------------------------------------------------ build gate -- */

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’\-–—.,/]*/gu;
export const countWords = (s: string): number => (s.match(WORD) ?? []).length;

/**
 * Every answer page must lead with the answer in under 40 words, and it must
 * be extractable standalone. Checked at build time so it can't quietly rot
 * into a paragraph three pages from now.
 */
/**
 * Print what's still outstanding on an unverified page, at build time.
 *
 * This used to render into the page as a red block, which put a work tracker
 * in front of readers. The console is where the person who has to make the
 * call actually is, and it means `npm run build` doubles as the to-do list.
 */
export function reportOutstanding(
  /** Path relative to the site root, without slashes: "parks/swallow-falls". */
  path: string,
  item: Verifiable & { callTo?: { name: string; phone: string } | null; outstanding?: string[] },
): void {
  /* Sourced records publish, so flagging them here would print the whole site
     on every build and train everyone to ignore the output. Only the ones
     actually being withheld are worth a line. */
  if (isPublishable(item)) return;

  const lines = [``, `  ⚑ /${path}/ is UNVERIFIED — noindex and dropped from the sitemap.`];
  if (item.callTo) lines.push(`    Call ${item.callTo.name} on ${item.callTo.phone}:`);
  for (const [i, o] of (item.outstanding ?? []).entries()) {
    lines.push(`      ${i + 1}. ${o}`);
  }
  lines.push(`    Then set verifiedDate + verifiedSource, or add a primary source.`, ``);
  console.warn(lines.join("\n"));
}

/**
 * Warn on titles and descriptions that Google will truncate.
 *
 * A warning rather than a build failure: a clipped description costs a little
 * click-through, it doesn't publish a wrong fact. The 40-word answer rule
 * below fails hard because that one does.
 *
 * ~60 chars of title and ~158 of description is roughly where the desktop SERP
 * cuts. Both are pixel-based in reality, so treat these as guide rails.
 */
export function checkMeta(where: string, title: string, description: string): void {
  const notes: string[] = [];
  if (title.length > 60) notes.push(`title ${title.length} chars (>60, will clip)`);
  if (title.length < 25) notes.push(`title ${title.length} chars (<25, thin)`);
  if (description.length > 158) notes.push(`description ${description.length} chars (>158, will clip)`);
  if (description.length < 110) notes.push(`description ${description.length} chars (<110, wastes the slot)`);
  if (notes.length) console.warn(`  ◦ SEO ${where}: ${notes.join("; ")}`);
}

export function assertAnswerLength(slug: string, answer: string): void {
  const n = countWords(answer);
  if (n > 40) {
    throw new Error(
      `[${slug}] The answer is ${n} words. The limit is 40.\n` +
        `Cut the answer — do not raise the limit. The 40-word answer is the format:\n` +
        `it's what gets extracted into an AI response, and it's the whole page for\n` +
        `someone reading on a phone in the sun.`,
    );
  }
}
