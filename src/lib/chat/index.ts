/**
 * The chat index.
 *
 * One flat shape covering both datasets, carrying only what the matcher needs
 * plus the canonical facts and the source link. Built from the same JSON the
 * pages render from, so the assistant and the page can never disagree.
 *
 * THE LOAD-BEARING RULE
 *
 * No language model touches a fact. The matcher below is deterministic — set
 * membership, tri-state comparisons, word matching. The model's only job, and
 * it happens elsewhere, is to ORDER a candidate list the matcher produced and
 * write a sentence of connective tissue. Every fact rendered in the answer
 * comes from this index, keyed by slug.
 *
 * That constraint is the whole reason a chatbot is allowable on this site at
 * all. A model that can phrase "Swallow Falls doesn't need a reservation" is
 * an existential risk to the only asset the site has.
 *
 * UNKNOWN IS NOT NO. Most regional facilities are unconfirmed. A matcher that
 * read null as false would return almost nothing and silently assert a pile of
 * facts nobody checked, so results come back in two buckets: matches, and
 * "might match, not confirmed".
 */
import stateParksData from "../../data/state-parks.json";
import regionalParksData from "../../data/regional-parks.json";
import {
  REGIONAL_FACILITY_LABELS,
  STATE_FEATURE_LABELS,
  restroomAnswer,
  type RegionalPark,
  type StatePark,
} from "../parks";
import { isPublishable, tierOf, type Tier } from "../verification";

/** Tri-state. `null` means unconfirmed and must never render as "no". */
export type Tri = boolean | null;

/** The attributes anyone actually asks about, normalised across both datasets. */
export interface ChatAttrs {
  restrooms: Tri;
  playground: Tri;
  swimming: Tri;
  beach: Tri;
  trails: Tri;
  camping: Tri;
  cabins: Tri;
  boatLaunch: Tri;
  boatRentals: Tri;
  fishing: Tri;
  picnic: Tri;
  pavilion: Tri;
  sports: Tri;
  pavedPath: Tri;
  winterUse: Tri;
  waterfall: Tri;
  petsAllowed: Tri;
  /** True when you can turn up without booking. null = unestablished. */
  walkIn: Tri;
  free: Tri;
}

export interface ChatEntry {
  slug: string;
  url: string;
  name: string;
  kind: "state" | "town";
  kindLabel: string;
  town: string;
  operator: string;
  blurb: string;
  attrs: ChatAttrs;
  /** Human-readable canonical answers, rendered verbatim. Never regenerated. */
  facts: { label: string; value: string; state: "yes" | "no" | "unknown" }[];
  reservation: string | null;
  feeNote: string;
  warnings: string[];
  phone: string | null;
  tier: Tier;
  sourcedOn: string | null;
  verifiedDate: string | null;
  source: { label: string; url: string } | null;
  /** Lowercased haystack for free-text matching. */
  haystack: string;
}

const ATTR_KEYS: (keyof ChatAttrs)[] = [
  "restrooms", "playground", "swimming", "beach", "trails", "camping",
  "cabins", "boatLaunch", "boatRentals", "fishing", "picnic", "pavilion",
  "sports", "pavedPath", "winterUse", "waterfall", "petsAllowed", "walkIn", "free",
];

const EMPTY: ChatAttrs = Object.fromEntries(ATTR_KEYS.map((k) => [k, null])) as ChatAttrs;

function stateEntry(p: StatePark): ChatEntry {
  const f = p.features;
  const facts = STATE_FEATURE_LABELS.map(([k, label]) => ({
    label,
    value: f[k] === null || f[k] === undefined ? "Not confirmed" : f[k] ? "Yes" : "No",
    state: (f[k] === null || f[k] === undefined ? "unknown" : f[k] ? "yes" : "no") as
      "yes" | "no" | "unknown",
  }));

  const r = p.reservation;
  const reservation =
    r.required === true
      ? `Reservation required — ${r.days ?? "days not confirmed"}${r.window ? ` (${r.window})` : ""}`
      : r.required === false
        ? "No reservation needed"
        : null;

  return {
    slug: p.slug,
    url: `/parks/${p.slug}/`,
    name: p.name,
    kind: "state",
    kindLabel: p.kind,
    town: p.town,
    operator: "Maryland DNR",
    blurb: p.blurb,
    attrs: {
      ...EMPTY,
      beach: f.beach,
      restrooms: f.restrooms,
      swimming: f.swimming,
      trails: f.trails,
      camping: f.camping,
      cabins: f.cabins,
      boatLaunch: f.boatLaunch,
      boatRentals: f.boatRentals,
      fishing: f.fishing,
      winterUse: f.winterUse,
      waterfall: f.waterfall,
      petsAllowed: f.petsAllowed,
      /* A park that needs booking is not a walk-in. Unknown stays unknown. */
      walkIn: r.required === null ? null : !r.required,
      free: p.fee.amount === 0 ? true : null,
    },
    facts,
    reservation,
    feeNote: p.fee.note,
    warnings: p.warnings,
    phone: p.phone,
    tier: tierOf(p),
    sourcedOn: p.sourcedOn,
    verifiedDate: p.verifiedDate,
    source: p.sources[0] ? { label: p.sources[0].label, url: p.sources[0].url } : null,
    haystack: "",
  };
}

function regionalEntry(p: RegionalPark): ChatEntry {
  const f = p.facilities;
  const wc = restroomAnswer(p.restrooms);
  const facts = [
    { label: "Restrooms", value: wc.text, state: wc.state },
    ...REGIONAL_FACILITY_LABELS.map(([k, label]) => ({
      label,
      value: f[k] === null || f[k] === undefined ? "Not confirmed" : f[k] ? "Yes" : "No",
      state: (f[k] === null || f[k] === undefined ? "unknown" : f[k] ? "yes" : "no") as
        "yes" | "no" | "unknown",
    })),
  ];

  return {
    slug: p.slug,
    url: `/parks/regional/${p.slug}/`,
    name: p.name,
    kind: "town",
    kindLabel: "Town park",
    town: p.town,
    operator: p.operator,
    blurb: p.blurb,
    attrs: {
      ...EMPTY,
      restrooms: p.restrooms.present,
      playground: f.playground,
      swimming: f.swimming,
      beach: f.beach,
      trails: f.trails,
      boatLaunch: f.boatLaunch,
      fishing: f.fishing,
      picnic: f.picnic,
      pavilion: f.pavilion,
      sports: f.sports,
      pavedPath: f.pavedPath,
      winterUse: f.winterUse,
      /* Town parks take no bookings — that IS the answer, not an unknown. */
      walkIn: true,
      free: p.fee.amount === 0 ? true : null,
    },
    facts,
    reservation: null,
    feeNote: p.fee.note,
    warnings: p.warnings,
    phone: p.phone,
    tier: tierOf(p),
    sourcedOn: p.sourcedOn,
    verifiedDate: p.verifiedDate,
    source: p.sources[0] ? { label: p.sources[0].label, url: p.sources[0].url } : null,
    haystack: "",
  };
}

/**
 * The published index.
 *
 * Filtered by isPublishable for the same reason the sitemap is: a record we
 * refuse to publish as a page must not reach the public through a chat window
 * either. The assistant is a view onto the site, not a side door around it.
 */
export const CHAT_INDEX: ChatEntry[] = [
  ...(stateParksData as StatePark[]).filter(isPublishable).map(stateEntry),
  ...(regionalParksData as RegionalPark[]).filter(isPublishable).map(regionalEntry),
].map((e) => ({
  ...e,
  haystack: [e.name, e.town, e.kindLabel, e.operator, e.blurb, ...e.warnings]
    .join(" ")
    .toLowerCase(),
}));
