/**
 * Listing order: photographed records first.
 *
 * WHY THIS ISN'T JUST VANITY
 *
 * A card with a photo is a card someone has stood in front of. On this site
 * the pictures are all mine, taken on a dated visit, which means "has a photo"
 * correlates almost exactly with "has been confirmed in person" — the strongest
 * tier we publish. Floating them up puts the best-evidenced records where they
 * get read, and it leaves an honest visual gap on the ones that are still just
 * an agency page I read.
 *
 * It is also a nudge aimed at me. A grid where the photographed records sit at
 * the top makes the unphotographed tail impossible to miss.
 *
 * The existing sort is kept as the tiebreaker rather than replaced, so a
 * section that ranked by completeness still ranks by completeness inside each
 * group.
 */
export function byPhotoThen<T extends { photos?: unknown[] }>(
  items: T[],
  then: (a: T, b: T) => number = () => 0,
): T[] {
  const scored = items.map((item, i) => ({ item, i }));
  scored.sort((a, b) => {
    const pa = (a.item.photos?.length ?? 0) > 0 ? 1 : 0;
    const pb = (b.item.photos?.length ?? 0) > 0 ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const t = then(a.item, b.item);
    /* Stable: fall back to the original index so equal records don't shuffle
       between builds and produce a meaningless diff. */
    return t !== 0 ? t : a.i - b.i;
  });
  return scored.map((s) => s.item);
}
