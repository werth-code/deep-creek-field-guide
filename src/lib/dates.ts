/**
 * Date formatting.
 *
 * All parsed by hand from "YYYY-MM-DD" rather than through `new Date(iso)`,
 * which interprets a bare ISO date as UTC and then renders it in local time —
 * shifting every date back a day west of Greenwich. On a site whose whole
 * claim is that the dates are right, that is not a cosmetic bug.
 */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MON = MONTHS.map((m) => m.slice(0, 3));

/** "2026-08-03" → "3 Aug 2026" — the stamp format. */
export function formatStampDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
}

/** "2026-08-03" → "3 August 2026" — for prose, where the abbreviation reads clipped. */
export function formatLongDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Days between an ISO date and today. `null` when there's no date at all. */
export function ageInDays(iso: string | null, today = new Date()): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  return Math.max(0, Math.round((today.getTime() - then.getTime()) / 86_400_000));
}
