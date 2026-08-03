/**
 * The deterministic lead sentence.
 *
 * This is both the fallback when the model is unavailable AND the safety net
 * when its answer fails validation. It is written from counts the matcher
 * produced, so it is always true, and it means the assistant degrades to
 * "correct but plain" rather than to "broken" or, worse, "confident and wrong".
 *
 * If you are ever tempted to make the model's sentence load-bearing, read this
 * file again: the site's entire value is that it does not say things it hasn't
 * checked, and a chat window is the easiest place in the world to lose that.
 */
import type { AttrKey } from "./match";
import type { MatchResult } from "./match";

/** Attribute → how a person says it in a sentence. */
const SAYS: Record<AttrKey, string> = {
  restrooms: "restrooms",
  playground: "a playground",
  swimming: "swimming",
  beach: "a beach",
  trails: "trails",
  camping: "camping",
  cabins: "cabins",
  boatLaunch: "a boat launch",
  fishing: "fishing",
  picnic: "picnic tables",
  pavilion: "a pavilion",
  sports: "courts or fields",
  pavedPath: "a paved path",
  winterUse: "winter use",
  waterfall: "a waterfall",
  petsAllowed: "dogs allowed",
  walkIn: "no reservation needed",
  free: "no fee",
};

export const saysFor = (k: AttrKey): string => SAYS[k] ?? k;

/** "a beach and restrooms" / "a beach, restrooms and a playground" */
export function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function deterministicLead(r: MatchResult): string {
  const { query, matches, unconfirmed } = r;
  const asked = list(query.wants.map(saysFor));
  const where = query.town
    ? ` in ${query.town.replace(/\b[a-z]/g, (c) => c.toUpperCase())}`
    : "";
  const what = query.kind === "state" ? "state park" : query.kind === "town" ? "town park" : "park";

  if (r.empty) {
    return "Tell me what you're after — a beach, restrooms, a playground, trails, somewhere you can turn up to without booking — and I'll show you what's confirmed.";
  }

  if (matches.length === 0 && unconfirmed.length === 0) {
    return `Nothing on the site matches${asked ? ` ${asked}` : ""}${where}. That may mean it doesn't exist here, or that we haven't checked it yet — the parks are listed either way.`;
  }

  /* The gap list is the UNION across candidates, so it must never be phrased
     as though every candidate is missing every item in it. */
  const gapsOf = (rows: typeof unconfirmed) =>
    list([...new Set(rows.flatMap((s) => s.unknown))].map(saysFor));

  if (matches.length === 0) {
    return `Nothing is confirmed for ${asked || "that"}${where} yet, but ${unconfirmed.length} ${plural(unconfirmed.length, what, what + "s")} could still qualify — the unchecked gaps among them are ${gapsOf(unconfirmed)}. They're below so you can call and ask, and we'll publish what you find out.`;
  }

  const head = `${matches.length} ${plural(matches.length, what, what + "s")}${where} ${plural(matches.length, "confirms", "confirm")} ${asked || "what you asked for"}.`;

  if (unconfirmed.length === 0) return head;

  return `${head} Another ${unconfirmed.length} could qualify — the gaps among them are ${gapsOf(unconfirmed)}, which nobody has checked yet.`;
}

/**
 * Validate a model-written lead before it is shown.
 *
 * The model is asked for tone, not facts, but "asked" is not a guarantee. Two
 * cheap checks catch the failure that actually matters — a fabricated number
 * or a park we never offered it:
 *
 *   - any digit run must appear in the counts we supplied
 *   - any park name it uses must be one of the candidates
 *
 * Fails closed: anything suspicious falls back to the deterministic sentence.
 */
export function leadIsSafe(lead: string, r: MatchResult): boolean {
  if (!lead || lead.length > 400) return false;

  const allowedNumbers = new Set(
    [
      r.matches.length,
      r.unconfirmed.length,
      r.matches.length + r.unconfirmed.length,
      r.query.wants.length,
    ].map(String),
  );
  for (const n of lead.match(/\d+/g) ?? []) {
    if (!allowedNumbers.has(n)) return false;
  }

  const offered = [...r.matches, ...r.unconfirmed].map((s) => s.entry.name.toLowerCase());
  const known = new Set([...offered, ...offered.flatMap((n) => n.split(/\s+/))]);
  /* Capitalised multi-word runs are almost always place names. */
  for (const m of lead.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) ?? []) {
    const low = m.toLowerCase();
    if (offered.some((n) => n.includes(low) || low.includes(n))) continue;
    if (low.split(/\s+/).every((w) => known.has(w))) continue;
    return false;
  }
  return true;
}
