/**
 * Recurrence tests.
 *
 * Date arithmetic is where silent bugs live: everything compiles, the page
 * renders, and one event in one month is quietly a week out. Writing this file
 * immediately caught a real one — the "last weekday of the month" branch was
 * landing in the FOLLOWING month, which no type checker would ever notice.
 *
 * Expected values are ground truth, not this code's own output. Run by
 * `npm run build` so a regression fails the build rather than the site.
 */
import { resolve, next, describe, formatOccurrence, occurrenceLabel, resolveHoliday, toISO }
  from "../src/lib/recurrence.ts";

let failures = 0, checks = 0;
const eq = (got, want, label) => {
  checks++;
  if (got === want) return;
  failures++;
  console.error(`    - ${label}: got ${got}, expected ${want}`);
};

// Holiday anchors, 2026
eq(toISO(resolveHoliday("memorial-day",2026)),      "2026-05-25", "Memorial Day 2026 (last Mon May)");
eq(toISO(resolveHoliday("labor-day",2026)),         "2026-09-07", "Labor Day 2026 (1st Mon Sep)");
eq(toISO(resolveHoliday("thanksgiving",2026)),      "2026-11-26", "Thanksgiving 2026 (4th Thu Nov)");
eq(toISO(resolveHoliday("columbus-day",2026)),      "2026-10-12", "Columbus Day 2026 (2nd Mon Oct)");
eq(toISO(resolveHoliday("independence-day",2026)),  "2026-07-04", "Independence Day 2026");
// Anchors across a different year, to catch year-specific luck
eq(toISO(resolveHoliday("memorial-day",2027)),      "2027-05-31", "Memorial Day 2027");
eq(toISO(resolveHoliday("thanksgiving",2025)),      "2025-11-27", "Thanksgiving 2025");

// nth weekday
const thirdSatAug = { kind:"nth-weekday", month:8, weekday:6, nth:3, days:3 };
eq(toISO(resolve(thirdSatAug,2026).start), "2026-08-15", "3rd Sat Aug 2026");
eq(toISO(resolve(thirdSatAug,2026).end),   "2026-08-17", "…+3 days");
eq(toISO(resolve(thirdSatAug,2027).start), "2027-08-21", "3rd Sat Aug 2027");

// LAST weekday — the case I just fixed
const lastSunSep = { kind:"nth-weekday", month:9, weekday:0, nth:-1 };
eq(toISO(resolve(lastSunSep,2026).start), "2026-09-27", "last Sun Sep 2026");
const lastFriMay = { kind:"nth-weekday", month:5, weekday:5, nth:-1 };
eq(toISO(resolve(lastFriMay,2026).start), "2026-05-29", "last Fri May 2026");

// anchor with offset + span
const memWeekend = { kind:"anchor", anchor:"memorial-day", offsetDays:-3, days:4 };
eq(toISO(resolve(memWeekend,2026).start), "2026-05-22", "Memorial weekend start 2026");
eq(toISO(resolve(memWeekend,2026).end),   "2026-05-25", "…through the Monday");

// month-crossing span
const crosses = { kind:"fixed", month:12, day:30, days:4 };
eq(formatOccurrence(resolve(crosses,2026)), "30 December 2026 – 2 January 2027", "year-crossing range");

// confirmed dates always beat the computed rule
const pinned = { "2026": { start:"2026-08-08", end:"2026-08-10" } };
eq(toISO(resolve(thirdSatAug,2026,pinned).start), "2026-08-08", "confirmed overrides rule");
eq(resolve(thirdSatAug,2026,pinned).computed, false, "…and is marked not-computed");
eq(resolve(thirdSatAug,2027,pinned).computed, true, "…other years still computed");

// announced
eq(resolve({kind:"announced",hint:"Late July"},2026), null, "announced resolves to null");

// next() rolls forward
const jan = { kind:"fixed", month:1, day:15 };
eq(toISO(next(jan,null,new Date(2026,7,3)).start), "2027-01-15", "next() rolls to next year");
eq(toISO(next(thirdSatAug,null,new Date(2026,7,3)).start), "2026-08-15", "next() keeps upcoming this year");
eq(toISO(next(thirdSatAug,null,new Date(2026,7,16)).start), "2026-08-15", "next() keeps a RUNNING event");

// descriptions
eq(describe(thirdSatAug), "Third Saturday in August, 3 days", "describe nth");
eq(describe(lastSunSep), "Last Sunday in September", "describe last");
eq(describe(memWeekend), "Memorial Day minus 3 days, 4 days", "describe anchor");
eq(formatOccurrence(resolve(thirdSatAug,2026)), "15–17 August 2026", "format same-month range");

// labels
const L = occurrenceLabel(thirdSatAug, null, new Date(2026,7,16));
eq(L.state,"running","label: running");
const U = occurrenceLabel(thirdSatAug, null, new Date(2026,7,3));
eq(U.state,"upcoming","label: upcoming"); eq(U.computed,true,"label: flagged computed");
eq(U.text,"In 12 days — 15–17 August 2026","label: countdown text");
const A = occurrenceLabel({kind:"announced",hint:"Late July, published each spring"},null,new Date(2026,7,3));
eq(A.state,"unknown","label: announced is unknown");

/* A REAL case, and the one that justifies the whole design.
   The Garrett County Agriculture Fair publishes 2026 dates (1–8 August) and
   states no recurring rule. 1 Aug 2026 is the first Saturday, so "first
   Saturday in August, 8 days" is a tempting inference — and a model that made
   it would confidently print a 2027 date nobody has announced. */
const fairRule = { kind:"announced", hint:"Early August — dates published each year" };
const fairDates = { "2026": { start:"2026-08-01", end:"2026-08-08" } };
eq(occurrenceLabel(fairRule, fairDates, new Date(2026,7,3)).text,
   "On now — 1–8 August 2026", "real fair: confirmed dates render");
eq(occurrenceLabel(fairRule, fairDates, new Date(2026,7,3)).computed,
   false, "real fair: not flagged as computed");
eq(resolve(fairRule, 2027, fairDates), null, "real fair: refuses to invent 2027");
eq(occurrenceLabel(fairRule, fairDates, new Date(2026,11,1)).state,
   "unknown", "real fair: unknown once the confirmed year passes");

if (failures) {
  console.error(`\n  \u2717 Recurrence tests: ${failures} failed.\n`);
  process.exit(1);
}
console.log(`  \u2713 Recurrence: ${checks} date rules verified against known dates.`);
