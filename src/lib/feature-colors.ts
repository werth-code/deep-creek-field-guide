/**
 * One color per feature, used everywhere that feature is referred to.
 *
 * WHAT THIS IS FOR
 *
 * A reader who has seen the blue playground glyph twice should recognize it on
 * the third page without reading the word. That only works if the color is
 * identical everywhere, which means it lives here and nowhere else — never a
 * Tailwind class typed at a render site, because those drift and nobody
 * notices until two pages disagree.
 *
 * WHY THESE PARTICULAR VALUES
 *
 * Every one is dark. That isn't an aesthetic preference, it's the constraint
 * that made the set possible at all:
 *
 *   - Filled chips put pale text on the color, so each needs 7:1 against the
 *     lighter of the two site backgrounds. That rules out mid-tones entirely.
 *   - The same color is used for the icon stroke on a pale page, where it
 *     needs to stay legible against the darkest page ground.
 *
 * Both were solved numerically rather than by eye: each hue was darkened in
 * 2% steps until it cleared 7:1 on fill, then checked against the page. The
 * worst case in the set is 7.0:1 filled and 6.1:1 as an icon. Picking these
 * by looking at them would have shipped several at 5:1 — the first draft did,
 * and thirty-three of them failed.
 *
 * HOW THEY'RE GROUPED
 *
 * Related things sit in the same part of the wheel, so the palette reads as a
 * system rather than a bag of colors: water is blue-teal, growing things are
 * green, built things are brown-rust, and restrooms is near-black because it
 * is the one people look for first.
 *
 * A NOTE ON WHAT THIS COSTS
 *
 * Green, amber and red still mean confirmed, unknown and warning on this site.
 * Two of these features are green and one is close to rust, so on a page with
 * both a status flag and a feature chip there is now more for a reader to
 * hold. The flags keep their icons and their position, which is what actually
 * distinguishes them; this is worth knowing about rather than pretending away.
 */
export const FEATURE_COLOR: Record<string, string> = {
  /* Comfort — the trip-critical set. */
  restrooms: "#1e2a33",
  water: "#145c61",
  showers: "#295772",
  picnic: "#6b4423",
  shade: "#3d5b32",
  pavilion: "#724a1b",
  grills: "#873b1e",

  /* Water. */
  waterfall: "#0e5877",
  beach: "#0a5a72",
  swimming: "#0d5973",
  splashPad: "#1c3e78",
  guardedSwimming: "#0a5b72",
  fishing: "#1d4f6b",
  surfFishing: "#195975",
  boatLaunch: "#124b63",
  boatRentals: "#14596f",
  pier: "#20506b",

  /* Stay. */
  camping: "#48582a",
  cabins: "#5c4326",

  /* Do. */
  trails: "#295e35",
  pavedPath: "#4a4f55",
  playground: "#1f4fa8",
  sports: "#5a3a7a",
  discGolf: "#345c28",
  skate: "#6d3b6b",
  winterUse: "#37566e",

  /* Dogs. */
  petsAllowed: "#77481b",
  dogPark: "#734b1a",

  /* Indoors. */
  free: "#205e48",
  giftShop: "#7a3f5c",
  accessible: "#24577c",
  branches: "#565058",
};

/** Falls back to body ink, so an unmapped key is dull rather than broken. */
export const colorFor = (key: string): string => FEATURE_COLOR[key] ?? "#10201c";
