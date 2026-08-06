/**
 * The chat index.
 *
 * One flat shape covering every dataset, carrying only what the matcher needs
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
 * IT HAS TO COVER EVERYTHING THE SITE COVERS. This indexed state parks and
 * town parks and nothing else, so asking it about the Discovery Center or
 * Blackwater Falls got you "nothing matches" — from an assistant sitting on a
 * site with pages for both. A search that silently knows less than the site it
 * answers for is worse than no search, because it reads as an answer.
 *
 * UNKNOWN IS NOT NO. Most regional facilities are unconfirmed. A matcher that
 * read null as false would return almost nothing and silently assert a pile of
 * facts nobody checked, so results come back in two buckets: matches, and
 * "might match, not confirmed".
 */
import stateParksData from "../../data/state-parks.json";
import regionalParksData from "../../data/regional-parks.json";
import indoorData from "../../data/indoor.json";
import nearbyData from "../../data/nearby.json";
import {
  REGIONAL_FACILITY_LABELS,
  STATE_FEATURE_LABELS,
  restroomAnswer,
  type RegionalPark,
  type StatePark,
} from "../parks";
import type { IndoorPlace } from "../indoor";
import type { NearbyPlace } from "../nearby";
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
  splashPad: Tri;
  sports: Tri;
  pavedPath: Tri;
  winterUse: Tri;
  waterfall: Tri;
  petsAllowed: Tri;
  /** Somewhere to go when it rains. */
  indoors: Tri;
  giftShop: Tri;
  /** True when you can turn up without booking. null = unestablished. */
  walkIn: Tri;
  free: Tri;
}

export interface ChatEntry {
  slug: string;
  url: string;
  name: string;
  kind: "state" | "town" | "indoor" | "nearby";
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
  "splashPad", "sports", "pavedPath", "winterUse", "waterfall", "petsAllowed",
  "indoors", "giftShop", "walkIn", "free",
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
      picnic: f.picnic,
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
      splashPad: f.splashPad,
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
 * Museums, libraries and nature centres.
 *
 * `indoors: true` is the whole point of the section and the thing people
 * actually ask for — "somewhere out of the rain" is a question the park
 * datasets cannot answer.
 */
function indoorEntry(p: IndoorPlace): ChatEntry {
  const facts = [
    {
      label: "Restrooms",
      value: p.restrooms === null || p.restrooms === undefined ? "Not confirmed" : p.restrooms ? "Yes" : "No",
      state: (p.restrooms === null || p.restrooms === undefined ? "unknown" : p.restrooms ? "yes" : "no") as
        "yes" | "no" | "unknown",
    },
    {
      label: "Admission",
      value: p.admission.free === true ? "Free" : p.admission.note,
      state: (p.admission.free === null ? "unknown" : p.admission.free ? "yes" : "no") as
        "yes" | "no" | "unknown",
    },
    ...(p.accessibility ? [{ label: "Accessibility", value: p.accessibility, state: "yes" as const }] : []),
    ...(p.parking ? [{ label: "Parking", value: p.parking, state: "yes" as const }] : []),
  ];

  return {
    slug: p.slug,
    url: `/indoors/${p.slug}/`,
    name: p.name,
    kind: "indoor",
    kindLabel: p.kind,
    town: p.town,
    operator: p.operator,
    blurb: p.blurb,
    attrs: {
      ...EMPTY,
      indoors: true,
      restrooms: p.restrooms,
      giftShop: p.giftShop,
      free: p.admission.free,
      /* No museum here takes a booking to walk in. */
      walkIn: true,
    },
    facts,
    reservation: null,
    feeNote: p.admission.note,
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
 * Just over the line.
 *
 * These are the answer to "is there anything else within an hour", which is a
 * question people ask constantly and the county datasets refuse by
 * construction. The distance line rides in the haystack so "West Virginia" or
 * "Allegany" finds them.
 */
function nearbyEntry(p: NearbyPlace): ChatEntry {
  const facts = [
    { label: "Where", value: `${p.town}, ${p.state}`, state: "yes" as const },
    { label: "Getting there", value: p.distance, state: "yes" as const },
    ...(p.season ? [{ label: "Season", value: p.season, state: "yes" as const }] : []),
    {
      label: "Admission",
      value: p.admission.amount === 0 ? "Free" : p.admission.note,
      state: (p.admission.amount === null ? "unknown" : "yes") as "yes" | "no" | "unknown",
    },
  ];

  return {
    slug: p.slug,
    url: `/nearby/${p.slug}/`,
    name: p.name,
    kind: "nearby",
    kindLabel: p.kind,
    town: p.town,
    operator: p.state,
    blurb: p.blurb,
    attrs: {
      ...EMPTY,
      free: p.admission.amount === 0 ? true : null,
    },
    facts,
    reservation: null,
    feeNote: p.admission.note,
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
  ...(indoorData as unknown as IndoorPlace[]).filter(isPublishable).map(indoorEntry),
  ...(nearbyData as unknown as NearbyPlace[]).filter(isPublishable).map(nearbyEntry),
].map((e) => ({
  ...e,
  haystack: [
    e.name,
    e.town,
    e.kindLabel,
    e.operator,
    e.blurb,
    /* The nearby records live in other counties and states, and that is
       exactly what people search on. */
    e.kind === "nearby" ? e.facts.map((f) => f.value).join(" ") : "",
    ...e.warnings,
  ]
    .join(" ")
    .toLowerCase(),
}));
