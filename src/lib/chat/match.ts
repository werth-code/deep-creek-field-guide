/**
 * The deterministic matcher.
 *
 * Parses a plain-English question into a set of requirements, then filters the
 * index by comparison. There is no model here and there must never be one:
 * this function decides WHICH parks are true answers, and everything
 * downstream is presentation.
 *
 * The output separates `matches` (attribute confirmed true) from `unconfirmed`
 * (attribute is null — might qualify, nobody has checked). Collapsing those two
 * would either hide most of the town parks or assert facts we don't have.
 */
import { CHAT_INDEX, type ChatAttrs, type ChatEntry } from "./index";

export type AttrKey = keyof ChatAttrs;

/** Phrasings → attribute. Longest phrase wins, so "boat launch" beats "boat". */
const VOCAB: [string[], AttrKey][] = [
  [["restroom", "restrooms", "toilet", "toilets", "bathroom", "bathrooms", "washroom", "wc", "porta potty", "portaloo"], "restrooms"],
  [["playground", "play ground", "swings", "swing set", "slide", "play area"], "playground"],
  [["splash pad", "splashpad", "splash park", "spray park", "sprayground", "water play", "spray ground"], "splashPad"],
  [["swim", "swimming", "swimmable", "wade", "wading"], "swimming"],
  [["beach", "sand", "sandy"], "beach"],
  [["trail", "trails", "hike", "hiking", "walk", "walking", "hikes"], "trails"],
  [["camp", "camping", "campground", "campsite", "campsites", "tent", "tents", "rv"], "camping"],
  [["cabin", "cabins", "lodge", "lodging"], "cabins"],
  [["boat rental", "boat rentals", "rent a boat", "rent boats", "rent a kayak", "rent kayaks", "hire a boat", "rentals"], "boatRentals"],
  [["boat launch", "boat ramp", "launch", "ramp", "kayak", "canoe", "paddle", "paddling", "boating", "boat"], "boatLaunch"],
  [["fish", "fishing", "trout", "angling"], "fishing"],
  [["picnic", "picnic table", "picnic tables", "lunch", "eat outside"], "picnic"],
  [["pavilion", "pavilions", "shelter", "shelters", "gazebo", "covered"], "pavilion"],
  [["sports", "ball field", "ball fields", "baseball", "soccer", "basketball", "tennis", "court", "courts", "field", "fields"], "sports"],
  [["paved", "paved path", "stroller", "strollers", "wheelchair", "accessible", "pram", "buggy"], "pavedPath"],
  [["winter", "snow", "sled", "sledding", "ski", "skiing", "snowshoe", "cross country", "cross-country"], "winterUse"],
  [["waterfall", "waterfalls", "falls", "cascade"], "waterfall"],
  [["dog", "dogs", "pet", "pets", "puppy", "leash", "leashed"], "petsAllowed"],
  [["no reservation", "without a reservation", "without booking", "walk in", "walk-in", "turn up", "show up", "last minute", "spontaneous", "no booking", "same day", "today", "right now", "drive up"], "walkIn"],
  [["free", "no fee", "no charge", "costs nothing", "without paying", "cheap"], "free"],
];

/* Longest phrase first so "boat launch" is consumed before "boat". */
const PHRASES: [string, AttrKey][] = VOCAB
  .flatMap(([words, key]) => words.map((w) => [w, key] as [string, AttrKey]))
  .sort((a, b) => b[0].length - a[0].length);

export type Kind = "state" | "town" | "indoor" | "nearby";

const KIND_WORDS: [string[], Kind][] = [
  [["state park", "state parks", "state forest", "dnr", "big park", "big parks"], "state"],
  [["town park", "town parks", "local park", "local parks", "municipal", "playground park", "community park", "community parks"], "town"],
  [["museum", "museums", "library", "libraries", "nature center", "nature centre", "indoors", "inside", "rainy day", "rainy", "when it rains", "out of the rain"], "indoor"],
  [["nearby", "near by", "over the line", "out of county", "outside the county", "west virginia", "wv", "allegany", "further afield", "day trip"], "nearby"],
];

/** Towns worth matching by name. Derived from the data at module load. */
const TOWNS = [...new Set(CHAT_INDEX.map((e) => e.town.toLowerCase()))].sort(
  (a, b) => b.length - a.length,
);

/**
 * Names, plus a short form of each.
 *
 * The index matched only the FULL name, and nobody types "Discovery Center at
 * Deep Creek Lake State Park" or "Blackwater Falls State Park" — they type the
 * first two words. Searching either by name returned nothing at all, which on
 * a site that has a page for both reads as "we don't have it".
 *
 * An alias that would match two records is dropped rather than guessed at:
 * "Town Park" belongs to Accident twice over, and picking one would be
 * inventing an answer.
 */
function aliases(name: string): string[] {
  const full = name.toLowerCase();
  const out = new Set<string>([full]);
  const cut = full.split(/ at | of /)[0].trim();
  const trimmed = cut
    .replace(/\s+(state park|state forest|memorial park|community park|town park|park)$/, "")
    .trim();
  for (const a of [cut, trimmed]) if (a.length >= 6) out.add(a);
  return [...out];
}

const ALIAS_USES = new Map<string, number>();
for (const e of CHAT_INDEX) {
  for (const a of aliases(e.name)) ALIAS_USES.set(a, (ALIAS_USES.get(a) ?? 0) + 1);
}

const NAMES = CHAT_INDEX.flatMap((e) =>
  aliases(e.name)
    .filter((a) => ALIAS_USES.get(a) === 1)
    .map((a) => [a, e.slug] as const),
).sort((a, b) => b[0].length - a[0].length);

/** Words that flip a requirement to "must NOT have". */
const NEGATORS = ["no ", "without ", "not ", "don't ", "dont ", "doesn't ", "avoid ", "except "];

export interface Query {
  raw: string;
  /** Attributes the answer must have. */
  wants: AttrKey[];
  /** Attributes the answer must NOT have. */
  excludes: AttrKey[];
  kind: Kind | null;
  town: string | null;
  /** A specific park asked about by name. */
  named: string | null;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();

/** Word-boundary containment, so "ski" doesn't match "skirt". */
function has(hay: string, needle: string): boolean {
  const i = hay.indexOf(needle);
  if (i === -1) return false;
  const before = i === 0 ? " " : hay[i - 1];
  const after = i + needle.length >= hay.length ? " " : hay[i + needle.length];
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

export function parse(raw: string): Query {
  const q = norm(raw);
  const wants: AttrKey[] = [];
  const excludes: AttrKey[] = [];

  /* Consume matched phrases so a shorter synonym can't double-count. */
  let rest = ` ${q} `;
  for (const [phrase, key] of PHRASES) {
    if (!has(rest, phrase)) continue;
    const at = rest.indexOf(phrase);
    const lead = rest.slice(Math.max(0, at - 12), at);
    const negated = NEGATORS.some((n) => lead.endsWith(n));
    /* "no reservation" is itself a want, not a negation of one. */
    const bucket = negated && key !== "walkIn" && key !== "free" ? excludes : wants;
    if (!bucket.includes(key)) bucket.push(key);
    rest = rest.replace(phrase, " ");
  }

  let kind: Kind | null = null;
  for (const [words, k] of KIND_WORDS) {
    if (words.some((w) => has(` ${q} `, w))) { kind = k; break; }
  }

  const town = TOWNS.find((t) => has(` ${q} `, t)) ?? null;
  /*
   * Naming a place is a LOOKUP, not a filter.
   *
   * Two ways in, because people type both. Either the question contains a
   * known alias ("...at blackwater falls state park"), or the question IS the
   * start of a name — "ruth enlow", "oakland b". The second is how anyone
   * actually searches, and without it a question that is nothing but a name
   * scored below every park in the county.
   */
  const q1 = ` ${q} `;
  let named = NAMES.find(([n]) => has(q1, n))?.[1] ?? null;
  if (!named && q.length >= 6) {
    /* Apostrophes are the difference between "hovatters" and "Hovatter's",
       and nobody reaches for the apostrophe key mid-search. */
    const bare = (t: string) => t.toLowerCase().replace(/'/g, "");
    const starts = CHAT_INDEX.filter((e) => bare(e.name).startsWith(bare(q)));
    if (starts.length === 1) named = starts[0].slug;
  }

  return { raw, wants, excludes, kind, town, named };
}

export interface Scored {
  entry: ChatEntry;
  /** Requirements this entry confirms. */
  met: AttrKey[];
  /** Requirements that are unconfirmed for this entry. */
  unknown: AttrKey[];
  score: number;
}

export interface MatchResult {
  query: Query;
  /** Every requirement confirmed true. */
  matches: Scored[];
  /** Nothing contradicts, but at least one requirement is unchecked. */
  unconfirmed: Scored[];
  /** True when the question carried no usable requirement at all. */
  empty: boolean;
}

export function match(raw: string, index: ChatEntry[] = CHAT_INDEX): MatchResult {
  const query = parse(raw);
  const { wants, excludes, kind, town, named } = query;

  const scored: Scored[] = [];

  for (const entry of index) {
    if (kind && entry.kind !== kind) continue;
    if (town && entry.town.toLowerCase() !== town) continue;

    /* A hard exclusion only fires on a CONFIRMED true. "No dogs" must not
       filter out a park whose pet rule nobody has checked — that would be
       treating unknown as yes. It ranks lower instead. */
    if (excludes.some((k) => entry.attrs[k] === true)) continue;

    const met = wants.filter((k) => entry.attrs[k] === true);
    const unknown = wants.filter((k) => entry.attrs[k] === null || entry.attrs[k] === undefined);
    const missing = wants.filter((k) => entry.attrs[k] === false);
    if (missing.length) continue;

    let score = met.length * 10 + (named === entry.slug ? 100 : 0);
    /* Free-text fallback so "waterfall hike near Oakland" still lands even if
       a word isn't in the vocabulary. */
    for (const w of norm(raw).split(" ")) {
      if (w.length > 3 && entry.haystack.includes(w)) score += 1;
    }
    /* Confirmed records rank above sourced ones, all else equal. */
    if (entry.tier === "confirmed") score += 2;
    /* Prefer records we actually know things about. */
    score += entry.facts.filter((f) => f.state !== "unknown").length * 0.1;

    scored.push({ entry, met, unknown, score });
  }

  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));

  const empty = wants.length === 0 && excludes.length === 0 && !kind && !town && !named;

  /*
   * The named record leads, even when a requirement it has never had checked
   * would otherwise drop it into the "might match" bucket. Asking for
   * Blackwater Falls by name and being shown Swallow Falls first, because the
   * word "falls" read as a waterfall requirement and the nearby dataset has no
   * waterfall field, is the assistant answering a question nobody asked.
   */
  const lead = named ? scored.find((s) => s.entry.slug === named) ?? null : null;
  const rest = lead ? scored.filter((s) => s !== lead) : scored;

  return {
    query,
    matches: [
      ...(lead ? [lead] : []),
      ...rest.filter((s) => s.unknown.length === 0),
    ],
    unconfirmed: rest.filter((s) => s.unknown.length > 0),
    empty,
  };
}
