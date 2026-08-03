/**
 * Post-build guard.
 *
 * The verification gate sets `noindex` from the data, and astro.config builds
 * the sitemap exclusion list from the same data. Those are two lists derived
 * separately, which means they can drift — and they did: adding /dogs/dog-parks/
 * and /dogs/pet-fees/ set them noindex but left them in the sitemap, because
 * the config only knew about towns.
 *
 * Rather than trusting them to stay in step, this checks the built output,
 * which is the only thing a crawler actually sees. Submitting a noindex URL in
 * a sitemap is a crawl-budget own goal and a contradictory signal.
 *
 * Runs automatically after `npm run build`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const DIST = "dist";

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const files = walk(DIST);
const problems = [];

/* ---- 1. noindex pages must not appear in the sitemap -------------------- */

const sitemaps = files.filter((f) => /sitemap-\d+\.xml$/.test(f));
const listed = new Set(
  sitemaps.flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
      new URL(m[1]).pathname,
    ),
  ),
);

for (const file of files.filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  const path = "/" + relative(DIST, file).replace(/index\.html$/, "");
  const noindex = /<meta name="robots" content="noindex/.test(html);

  if (noindex && listed.has(path)) {
    problems.push(`${path} is noindex but IS in the sitemap`);
  }

  // A noindex page must not ship structured data either — don't hand a crawler
  // rich results for something it's been told to ignore.
  if (noindex && html.includes("application/ld+json")) {
    problems.push(`${path} is noindex but emits JSON-LD`);
  }

  // Every indexable page needs the basics.
  if (!noindex) {
    if (!/rel="canonical"/.test(html)) problems.push(`${path} has no canonical`);
    if (!/<meta name="description"/.test(html)) problems.push(`${path} has no description`);
    if (!/property="og:title"/.test(html)) problems.push(`${path} has no og:title`);
  }
}

/* ---- 2. report ---------------------------------------------------------- */

const indexable = files.filter(
  (f) => f.endsWith(".html") && !/content="noindex/.test(readFileSync(f, "utf8")),
).length;

if (problems.length) {
  console.error(`\n  ✗ Build check failed:\n${problems.map((p) => `      ${p}`).join("\n")}\n`);
  process.exit(1);
}

/*
 * Every script that ships must PARSE — inline ones included.
 *
 * Added after a duplicate `const` in an inline <script> shipped a build that
 * looked completely healthy: Astro bundled it without complaint, the page
 * rendered, and the only symptom was that no JavaScript ran at all. Nothing in
 * the pipeline noticed. A page whose interactive half is silently dead is
 * exactly what this exists to catch.
 *
 * Astro inlines small scripts straight into the HTML rather than emitting a
 * .js file, so checking dist/**\/*.js alone finds nothing — the first version
 * of this guard passed by checking zero files, which is its own lesson.
 */
const tmp = mkdtempSync(join(tmpdir(), "buildcheck-"));
const probe = join(tmp, "probe.mjs");
let checked = 0;

const parses = (code, where) => {
  writeFileSync(probe, code);
  try {
    execFileSync(process.execPath, ["--check", probe], { stdio: "pipe" });
  } catch (err) {
    const msg = String(err.stderr ?? err).split("\n").find((l) => /Error/.test(l)) ?? "parse error";
    problems.push(`${where} does not parse — ${msg.trim()}`);
  }
  checked++;
};

for (const f of files.filter((x) => x.endsWith(".js"))) {
  parses(readFileSync(f, "utf8"), relative(DIST, f));
}

for (const f of files.filter((x) => x.endsWith(".html"))) {
  const html = readFileSync(f, "utf8");
  let i = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, code] = m;
    if (/\bsrc=/i.test(attrs)) continue;                 // external, checked above
    if (/type=["']?(application\/(ld\+json|json)|importmap)/i.test(attrs)) continue;
    if (!code.trim()) continue;
    parses(code, `${relative(DIST, f)} inline script #${++i}`);
  }
}

if (problems.length) {
  console.error("\n  ✗ Build check failed:\n" + problems.map((p) => `    - ${p}`).join("\n") + "\n");
  process.exit(1);
}

if (!checked) {
  console.error("\n  ✗ Build check failed: no scripts were checked — the parse guard is not looking anywhere.\n");
  process.exit(1);
}


console.log(
  `  ✓ Build check: ${listed.size} URLs in sitemap, ${indexable} indexable pages, no contradictions.\n`,
);
