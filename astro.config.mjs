// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

/*
 * Records that can't publish must stay out of the sitemap too — noindex and
 * the sitemap are derived separately and WILL drift. scripts/check-build.mjs
 * is the backstop that reads the built output and fails on any contradiction.
 *
 * Mirrors tierOf() in src/lib/verification.ts. Add each data file here as you
 * create it.
 */
const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
/* Mirrors tierOf() in src/lib/verification.ts, INCLUDING the primary-source
   rule. A source flagged `primary: false` is a community site or a guide and
   cannot carry a record on its own. This duplication is why check-build.mjs
   exists — it caught this the first time the two drifted apart. */
const publishable = (r) => {
  if (r.verifiedDate && r.verifiedSource) return true;
  const primary = (r.sources ?? []).filter((s) => s.primary !== false);
  return Boolean(primary.length && r.sourcedOn);
};

const unverified = [
  ...read('./src/data/state-parks.json').filter((r) => !publishable(r)).map((r) => `/parks/${r.slug}/`),
  ...read('./src/data/regional-parks.json').filter((r) => !publishable(r)).map((r) => `/parks/regional/${r.slug}/`),
  ...read('./src/data/events.json').filter((r) => !publishable(r)).map((r) => `/events/${r.slug}/`),
];

export default defineConfig({
  site: 'https://deepcreekfieldguide.com',
  build: { format: 'directory' },   // trailing-slash directory URLs
  integrations: [
    sitemap({ filter: (page) => !unverified.some((path) => page.endsWith(path)) }),
  ],
  vite: { plugins: [tailwindcss()] },
});
