# Field report intake

One Cloudflare Worker and one R2 bucket behind both field guides. It takes a
report and up to four photos, puts them in `pending/`, and stops.

**It cannot publish anything.** There is no code path from this Worker to a
rendered page. Approving a report is a local step you do by hand — see
*Reading what comes in* below.

## What it costs

Nothing, at this volume.

| | Free allowance | What this uses |
|---|---|---|
| R2 storage | 10 GB | a few hundred MB, and only until you clear each report |
| R2 writes | 1M/month | a handful |
| R2 reads | 10M/month | a handful |
| R2 egress | free, always | — |
| Workers | 100k requests/day | a handful |

Two things to know. R2 makes you complete a checkout flow to enable it, so
there's a card on file even though the bill is $0. And the free Workers plan
allows **10ms of CPU per request** — this Worker stays under it by never
decoding an image. The browser resizes before uploading and the Worker only
streams bytes into R2, which is I/O, not CPU. Don't add server-side image
processing here without expecting the $5/month plan.

## Setting it up

Run these yourself — they touch your Cloudflare account and I shouldn't hold
your credentials.

```bash
cd worker && npm install -g wrangler && wrangler login
```

```bash
wrangler r2 bucket create field-guide-reports
```

Optional, for the per-IP daily cap. The Worker runs without it, because a
missing rate limiter shouldn't take the form offline:

```bash
wrangler kv namespace create RATE
```

Paste the id it prints into `wrangler.toml` and uncomment that block. Then:

```bash
wrangler deploy
```

Wrangler prints the Worker's URL. Put it in **both** repos as a GitHub Actions
variable named `PUBLIC_REPORT_ENDPOINT` (Settings → Secrets and variables →
Actions → Variables), then re-run a deploy on each site. Until that variable is
set the report page shows a mailto fallback rather than a form, so nothing
breaks in the meantime.

## Reading what comes in

```bash
node scripts/reports.mjs list
node scripts/reports.mjs get deepcreek/2026-08-06-1a2b3c4d
```

`get` drops the report and its photos into `reports-inbox/`, which is
gitignored. From there it's the normal pipeline:

- photos through `./scripts/import-photo.sh`, which strips EXIF and writes the
  two sizes
- the text into the record's `reports[]` with `acceptedOn` set to the day you
  accepted it

Then clear it:

```bash
node scripts/reports.mjs done deepcreek/2026-08-06-1a2b3c4d
```

## What it refuses

- A honeypot field no human sees. Filled means a bot; it gets a 200 so it
  doesn't retry, and nothing is stored.
- 12MB total, four photos, JPEG/PNG/WebP only.
- Ten reports per IP per day, if the KV binding exists.
- Reports under ten characters.

No Turnstile. Cloudflare's own bot check is free and would be the obvious
thing to reach for, but it loads a script from `challenges.cloudflare.com` and
both sites promise no third-party JavaScript. For a form expecting single
digits a week, a honeypot and a queue nobody can publish from are enough.
