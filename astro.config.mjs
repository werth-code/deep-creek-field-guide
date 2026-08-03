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
const publishable = (r) =>
  Boolean((r.verifiedDate && r.verifiedSource) || (r.sources?.length && r.sourcedOn));

const unverified = [
  ...read('./src/data/state-parks.json').filter((r) => !publishable(r)).map((r) => `/parks/${r.slug}/`),
  ...read('./src/data/regional-parks.json').filter((r) => !publishable(r)).map((r) => `/parks/regional/${r.slug}/`),
];

export default defineConfig({
  site: 'https://deepcreekfieldguide.com',
  build: { format: 'directory' },   // trailing-slash directory URLs
  integrations: [
    sitemap({ filter: (page) => !unverified.some((path) => page.endsWith(path)) }),
  ],
  vite: { plugins: [tailwindcss()] },
});
