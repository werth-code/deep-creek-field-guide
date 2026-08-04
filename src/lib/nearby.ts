/**
 * Just over the line.
 *
 * Places outside Garrett County that Deep Creek visitors genuinely drive to.
 *
 * WHY THIS IS ITS OWN SECTION AND NOT A ROW IN THE PARKS TABLE
 *
 * The masthead says "A reference for Garrett County, Maryland". That claim is
 * worth something precisely because it is narrow, and quietly filing a West
 * Virginia zoo among the county's parks would spend that for one entry.
 * Visitors don't care about county lines; a reference that says what it covers
 * has to. Both things are true, so the answer is a section that states the
 * line rather than crossing it silently.
 *
 * These are also a different KIND of record. A private attraction sets its own
 * prices and hours and changes them without notice, where a state park's fee
 * is published by an agency. So `operator` is the business, verification is
 * explicitly against the operator's own site, and admission is expected to be
 * the first thing that rots.
 */
import { type Photo } from "./parks";

export interface NearbyPlace {
  slug: string;
  name: string;
  /** Where it also gets called something else. Two names, one place. */
  alsoKnownAs: string | null;
  /** Plain-language distance from the lake, and roughly how long. */
  distance: string;
  town: string;
  state: string;
  county: string | null;
  address: string | null;
  blurb: string;
  /** What it actually is: zoo, ski area, nature preserve. */
  kind: string;
  season: string | null;
  admission: { note: string; amount: number | null };
  phone: string | null;
  website: { label: string; url: string } | null;
  warnings: string[];
  photos?: Photo[];
  verdict?: { text: string; on: string };
  sources: { label: string; url: string; note?: string | null; primary?: boolean }[];
  sourcedOn: string | null;
  verifiedDate: string | null;
  verifiedSource: string | null;
  outstanding?: string[];
  reports?: { receivedOn: string; visitedOn: string | null; from: string; what: string; affects?: string[] }[];
}
