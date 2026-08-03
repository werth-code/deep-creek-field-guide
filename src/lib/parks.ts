/**
 * Parks — state and regional.
 *
 * Same convention as everything else here: `null` means UNVERIFIED, never
 * "no". A park with `camping: null` has not been checked; it does not lack a
 * campground. Rendering those as "No" would invent facts ten at a time.
 */

export interface Reservation {
  /** null = we haven't established whether one is needed. */
  required: boolean | null;
  window: string | null;
  days: string | null;
  bookAhead: string | null;
  note: string | null;
  /** Entry windows, where the park sells timed slots rather than open entry. */
  slots?: string[] | null;
}

/**
 * A published correction.
 *
 * /how-we-verify/ promises that when we get something wrong we fix it, re-date
 * it, and say on the page that we did. A promise like that is worth nothing
 * without somewhere for it to live, so corrections are part of the record and
 * render on the page rather than being edited away in a commit nobody reads.
 */
export interface Correction {
  /** ISO date the fix was made. */
  date: string;
  /** What we had said. Stated plainly, not softened. */
  was: string;
  /** What it actually is, and how we established that. */
  now: string;
}

/**
 * A field report — someone who was actually there.
 *
 * /how-we-verify/ says a report becomes a dated fact if we can use it. That
 * promise needs somewhere to live, or reports quietly turn into unattributed
 * prose and the site loses the thing it sells.
 *
 * A first-hand visit legitimately counts as `confirmed` under the method
 * ("we called, visited, or asked"). But it confirms a FIELD, not a record:
 * standing in the car park tells you where the restrooms are, and nothing
 * about the fee schedule. So reports attach here, name what they bear on, and
 * the record's own tier is unaffected until the rest is checked.
 *
 * `visitedOn` is separate from `receivedOn` on purpose. A report from someone
 * who was there last August is worth less than one from Tuesday, and a site
 * that stamps dates on everything cannot be vague about which date it means.
 */
export interface FieldReport {
  /** ISO date we received it. */
  receivedOn: string;
  /** ISO date they were there. null when they didn't say — and it shows. */
  visitedOn: string | null;
  /** Who. A name, "a reader", or the maintainer. */
  from: string;
  what: string;
  /** Which fields this bears on, for display beside them. */
  affects?: string[];
}

/** A photograph attached to a record. Shape mirrors Photo.astro's props. */
export interface Photo {
  file: string;
  alt: string;
  caption?: string | null;
  credit: string;
  takenOn: string;
  portrait?: boolean;
}

export interface StateParkFeatures {
  waterfall: boolean | null;
  /** Sand you can sit on. Distinct from `swimming`, which is about the water. */
  beach: boolean | null;
  swimming: boolean | null;
  /**
   * Added after a reader pointed out Deep Creek Lake has them and the schema
   * had nowhere to say so. State parks had no restroom field at all, which
   * meant the one question people ask most could only be answered for town
   * parks.
   */
  restrooms: boolean | null;
  camping: boolean | null;
  cabins: boolean | null;
  trails: boolean | null;
  boatLaunch: boolean | null;
  /** Renting a boat AT the park — not a private marina elsewhere on the lake. */
  boatRentals: boolean | null;
  fishing: boolean | null;
  winterUse: boolean | null;
  petsAllowed: boolean | null;
}

export interface StatePark {
  slug: string;
  name: string;
  kind: string;
  town: string;
  acres: number | null;
  blurb: string;
  features: StateParkFeatures;
  reservation: Reservation;
  fee: {
    note: string;
    amount: number | null;
    /** Maryland charges per PERSON in summer and per VEHICLE off-season. */
    schedule?: { when: string; resident: string; nonResident: string }[] | null;
    passes?: string | null;
  };
  /** Where you find a person, a shop, or a pass. Mostly unchecked so far. */
  services?: {
    parkOffice: string | null;
    officePhone: string | null;
    officeAddress: string | null;
    giftShop: boolean | null;
    campStore: boolean | null;
    passesSoldHere: boolean | null;
    note: string | null;
  };
  warnings: string[];
  phone: string | null;
  hours: string | null;
  sources: { label: string; url: string; note?: string | null }[];
  sourcedOn: string | null;
  verifiedDate: string | null;
  verifiedSource: string | null;
  outstanding?: string[];
  corrections?: Correction[];
  reports?: FieldReport[];
  photos?: Photo[];
}

export interface Restrooms {
  present: boolean | null;
  type: "permanent" | "portable" | null;
  seasonal: boolean | null;
  /**
   * The catch, in three or four words — "sometimes locked", "campers only".
   *
   * Added because a reader scanning a card sees the summary answer and nothing
   * else, and "Yes" for a block that is often locked is the kind of true
   * statement that strands somebody. The caveat rides along with the answer
   * everywhere it appears, rather than sitting in a note further down the page
   * that a scanner never reaches.
   */
  caveat?: string | null;
  note: string | null;
  /** Field-level provenance — a toilet gets confirmed long before a park does. */
  confirmedOn?: string | null;
  confirmedBy?: string | null;
}

export interface RegionalFacilities {
  playground: boolean | null;
  swimming: boolean | null;
  beach: boolean | null;
  picnic: boolean | null;
  pavilion: boolean | null;
  grills: boolean | null;
  trails: boolean | null;
  sports: boolean | null;
  boatLaunch: boolean | null;
  fishing: boolean | null;
  pavedPath: boolean | null;
  winterUse: boolean | null;
}

export interface RegionalPark {
  slug: string;
  name: string;
  operator: string;
  town: string;
  address: string;
  acres: number | null;
  blurb: string;
  restrooms: Restrooms;
  facilities: RegionalFacilities;
  accessibility: string | null;
  /**
   * WHO MAY ACTUALLY USE IT.
   *
   * Added for the 4-H centre, where the honest answer is neither "public
   * park" nor "closed": part is open, part is programme-and-hire only, and a
   * facilities table alone would send a family there to swim in water they
   * cannot get to. Where this is null the record is an ordinary public park.
   */
  access: string | null;
  hours: string | null;
  hoursNote: string | null;
  phone: string | null;
  fee: { note: string; amount: number | null };
  warnings: string[];
  sources: { label: string; url: string; note?: string | null }[];
  sourcedOn: string | null;
  verifiedDate: string | null;
  verifiedSource: string | null;
  outstanding?: string[];
  photos?: Photo[];
  /* Town parks correct and get reported on exactly like state parks do — the
     promise on /how-we-verify/ isn't scoped to one dataset. */
  corrections?: Correction[];
  reports?: FieldReport[];
}

/* ------------------------------------------------------------- rendering -- */

export type Answer = { text: string; state: "yes" | "no" | "unknown" };

export function tri(v: boolean | null, yes = "Yes", no = "No"): Answer {
  if (v === null || v === undefined) return { text: "Not confirmed", state: "unknown" };
  return v ? { text: yes, state: "yes" } : { text: no, state: "no" };
}

/**
 * The restroom answer in the words someone needs — not "true". A permanent
 * block, a portable unit and a block that opens after Memorial Day are three
 * different answers, and the third ruins an April trip.
 */
export function restroomAnswer(r: Restrooms): Answer {
  if (r.present === null || r.present === undefined) {
    return { text: "Not confirmed", state: "unknown" };
  }
  if (!r.present) return { text: "None", state: "no" };
  const bits = [r.type === "portable" ? "Portable units" : "Yes"];
  if (r.caveat) bits.push(r.caveat);
  if (r.seasonal === true) bits.push("seasonal only");
  if (r.seasonal === null && !r.caveat) bits.push("season not confirmed");
  return { text: bits.join(" — "), state: "yes" };
}

export const STATE_FEATURE_LABELS: [keyof StateParkFeatures, string][] = [
  ["waterfall", "Waterfall"],
  ["beach", "Beach"],
  ["swimming", "Swimming"],
  ["restrooms", "Restrooms"],
  ["camping", "Camping"],
  ["cabins", "Cabins"],
  ["trails", "Trails"],
  ["boatLaunch", "Boat launch"],
  ["boatRentals", "Boat rentals"],
  ["fishing", "Fishing"],
  ["winterUse", "Winter use"],
  ["petsAllowed", "Pets"],
];

export const REGIONAL_FACILITY_LABELS: [keyof RegionalFacilities, string][] = [
  ["playground", "Playground"],
  ["swimming", "Swimming"],
  ["beach", "Beach"],
  ["picnic", "Picnic tables"],
  ["pavilion", "Pavilion"],
  ["grills", "Grills"],
  ["trails", "Trails"],
  ["sports", "Courts / fields"],
  ["boatLaunch", "Boat launch"],
  ["fishing", "Fishing"],
  ["pavedPath", "Paved path"],
  ["winterUse", "Winter use"],
];

export const presentState = (p: StatePark) =>
  STATE_FEATURE_LABELS.filter(([k]) => p.features[k] === true).map(([, l]) => l);

export const presentRegional = (p: RegionalPark) =>
  REGIONAL_FACILITY_LABELS.filter(([k]) => p.facilities[k] === true).map(([, l]) => l);

export function completenessState(p: StatePark) {
  const v = STATE_FEATURE_LABELS.map(([k]) => p.features[k]);
  return { known: v.filter((x) => x !== null && x !== undefined).length, total: v.length };
}

/** Restrooms count as a field here — it's the one people ask about. */
export function completenessRegional(p: RegionalPark) {
  const v: (boolean | null)[] = [
    p.restrooms.present,
    ...REGIONAL_FACILITY_LABELS.map(([k]) => p.facilities[k]),
  ];
  return { known: v.filter((x) => x !== null && x !== undefined).length, total: v.length };
}

/** Reservation status, as a flag with a redundant texture channel. */
export function reservationFlag(r: Reservation): {
  word: string;
  bar: "bar-solid" | "bar-dotted" | "bar-hatch";
  chip: string;
  icon: "check" | "alert" | "cross";
} {
  if (r.required === true)
    return {
      word: "Reservation required",
      bar: "bar-hatch",
      chip: "bg-flag-red-bearing text-white",
      icon: "alert",
    };
  if (r.required === false)
    return {
      word: "No reservation needed",
      bar: "bar-solid",
      chip: "bg-flag-green-bearing text-white",
      icon: "check",
    };
  return {
    word: "Not confirmed",
    bar: "bar-dotted",
    chip: "bg-flag-amber text-ink",
    icon: "alert",
  };
}

/* ----------------------------------------------------------------- asks -- */

/**
 * Reader-facing questions for the report form.
 *
 * DERIVED FROM THE DATA, never from `outstanding`. Those entries are written
 * for whoever is making the phone calls — "PRIORITY: get the admission price,
 * and whether there is a separate parking charge" — and putting that in front
 * of a visitor asks them to care about our workflow. They don't. They want the
 * answer too.
 *
 * So the questions come from which fields are actually null, phrased the way
 * someone standing in the car park would say them. That also means they can
 * never drift out of date: fill the field in and the question stops appearing.
 */
const STATE_ASKS: [keyof StateParkFeatures, string][] = [
  ["restrooms", "Are there restrooms?"],
  ["petsAllowed", "Are dogs allowed?"],
  ["beach", "Is there a beach?"],
  ["swimming", "Can you swim?"],
  ["camping", "Can you camp?"],
  ["cabins", "Are there cabins?"],
  ["boatRentals", "Can you rent a boat?"],
  ["boatLaunch", "Is there a boat launch?"],
  ["winterUse", "Is it open in winter?"],
  ["trails", "Are there trails?"],
  ["fishing", "Can you fish?"],
];

const REGIONAL_ASKS: [keyof RegionalFacilities, string][] = [
  ["playground", "Is there a playground?"],
  ["swimming", "Can you swim?"],
  ["beach", "Is there a beach?"],
  ["picnic", "Are there picnic tables?"],
  ["pavilion", "Is there a pavilion?"],
  ["sports", "Are there courts or fields?"],
  ["pavedPath", "Is there a paved path?"],
  ["trails", "Are there trails?"],
  ["boatLaunch", "Is there a boat launch?"],
  ["winterUse", "Is it used in winter?"],
];

/** Four at most. A wall of questions reads as a survey and gets nothing back. */
export function asksForState(p: StatePark): string[] {
  const out: string[] = [];
  if (!p.hours) out.push("What are the hours?");
  for (const [k, q] of STATE_ASKS) {
    if (p.features[k] === null || p.features[k] === undefined) out.push(q);
  }
  if (p.services && p.services.giftShop === null && p.services.campStore === null) {
    out.push("Is there a shop?");
  }
  return out.slice(0, 4);
}

export function asksForRegional(p: RegionalPark): string[] {
  const out: string[] = [];
  if (p.restrooms.present === null || p.restrooms.present === undefined) {
    out.push("Are there restrooms?");
  }
  if (!p.hours) out.push("What are the hours?");
  for (const [k, q] of REGIONAL_ASKS) {
    if (p.facilities[k] === null || p.facilities[k] === undefined) out.push(q);
  }
  return out.slice(0, 4);
}
