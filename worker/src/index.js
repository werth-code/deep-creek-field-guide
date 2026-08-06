/**
 * Field report intake.
 *
 * One Worker and one R2 bucket behind both field guides. It accepts a report
 * and up to four photographs, drops them in a pending/ prefix, and stops.
 * That's the whole job.
 *
 * NOTHING IT RECEIVES IS EVER PUBLISHED BY IT.
 *
 * This is the part worth being loud about. A submission lands in R2 and waits
 * for a person. Approving one is a local step — scripts/reports.mjs pulls it
 * down, the photos go through the same import-photo.sh pipeline as every other
 * photograph on the site, and the text becomes a dated field note with
 * `acceptedOn` set. There is no code path from this Worker to a rendered page.
 *
 * That isn't caution about spam. The site's entire claim is that a person
 * checked each fact and said when. An endpoint that could publish would make
 * that claim false the first time it ran, however good the filtering was.
 *
 * WHY THE CPU BUDGET SHAPES THE DESIGN
 * Workers' free plan allows 10ms of CPU per request. Decoding and resizing a
 * phone photograph would blow straight through it and force a paid plan for no
 * benefit. So the browser resizes before it uploads and this Worker only moves
 * bytes: reading a stream and writing it to R2 is I/O, which doesn't count
 * against the CPU budget. The whole thing stays inside the free tier.
 *
 * NO TURNSTILE. Cloudflare's own bot check would be free and is the obvious
 * thing to reach for, but it loads a script from challenges.cloudflare.com and
 * both sites promise no third-party JavaScript. A honeypot, a hard size cap, a
 * per-IP daily limit and the fact that nothing auto-publishes are enough for a
 * form that expects single-digit submissions a week.
 */

const ALLOWED_ORIGINS = [
  "https://deepcreekfieldguide.com",
  "https://delawarefieldguide.com",
  "http://localhost:8290",
  "http://localhost:8250",
];

/* A phone photo resized to 1600px lands around 300-500KB. Four of those plus
   the text is comfortably under this, and anything above it is either a
   mistake or someone probing. */
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PHOTOS = 4;
const MAX_PER_IP_PER_DAY = 10;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const cors = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
});

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });

/**
 * A no-JavaScript submission is a plain form post and gets a plain redirect
 * back. The form works without scripts, so the response has to as well.
 */
const done = (ok, origin, site) => {
  const base = site === "delaware" ? "https://delawarefieldguide.com" : "https://deepcreekfieldguide.com";
  return new Response(null, {
    status: 303,
    headers: { Location: `${base}/report/${ok ? "thanks" : "problem"}/`, ...cors(origin) },
  });
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, origin);

    const size = Number(request.headers.get("Content-Length") || 0);
    if (size > MAX_BYTES) return json({ error: "Too big. Four photos maximum." }, 413, origin);

    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "Could not read that submission." }, 400, origin);
    }

    const str = (k) => String(form.get(k) ?? "").trim();
    const wantsJson = str("js") === "1";
    const site = str("site") === "delaware" ? "delaware" : "deepcreek";

    /* Honeypot. A field no human sees and every naive bot fills in. Answer 200
       so whatever filled it believes it succeeded and doesn't retry. */
    if (str("hp")) return wantsJson ? json({ ok: true }, 200, origin) : done(true, origin, site);

    const what = str("what");
    if (what.length < 10) {
      const msg = "Tell me what you saw — a sentence is plenty.";
      return wantsJson ? json({ error: msg }, 400, origin) : done(false, origin, site);
    }
    if (what.length > 4000) {
      const msg = "That's longer than this box takes. Email it instead.";
      return wantsJson ? json({ error: msg }, 400, origin) : done(false, origin, site);
    }

    /* Per-IP daily cap. Optional: with no KV binding the Worker still runs,
       because a missing rate limiter must not take the form offline. */
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE) {
      const day = new Date().toISOString().slice(0, 10);
      const key = `rl:${day}:${ip}`;
      const seen = Number((await env.RATE.get(key)) || 0);
      if (seen >= MAX_PER_IP_PER_DAY) {
        const msg = "That's a lot of reports for one day. Try again tomorrow.";
        return wantsJson ? json({ error: msg }, 429, origin) : done(false, origin, site);
      }
      await env.RATE.put(key, String(seen + 1), { expirationTtl: 60 * 60 * 36 });
    }

    const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
    const dir = `pending/${site}/${id}`;

    const photos = form.getAll("photos").filter((f) => typeof f === "object" && f.size > 0);
    if (photos.length > MAX_PHOTOS) {
      const msg = `${MAX_PHOTOS} photos maximum.`;
      return wantsJson ? json({ error: msg }, 400, origin) : done(false, origin, site);
    }

    const stored = [];
    let n = 0;
    for (const file of photos) {
      if (!IMAGE_TYPES.has(file.type)) {
        const msg = "Photos need to be JPEG, PNG or WebP.";
        return wantsJson ? json({ error: msg }, 400, origin) : done(false, origin, site);
      }
      n += 1;
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const name = `photo-${n}.${ext}`;
      /* Streamed straight through. No decode, no resize, no CPU. */
      await env.REPORTS.put(`${dir}/${name}`, file.stream(), {
        httpMetadata: { contentType: file.type },
      });
      stored.push({ name, bytes: file.size, type: file.type });
    }

    const record = {
      id,
      site,
      receivedOn: new Date().toISOString(),
      subject: str("subject") || null,
      path: str("path") || null,
      visitedOn: str("visited") || null,
      what,
      from: str("name") || null,
      /* Kept so a fact can be chased up, never rendered. */
      email: str("email") || null,
      photos: stored,
      meta: {
        ip,
        country: request.headers.get("CF-IPCountry") || null,
        userAgent: (request.headers.get("User-Agent") || "").slice(0, 200),
      },
    };

    await env.REPORTS.put(`${dir}/report.json`, JSON.stringify(record, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    return wantsJson
      ? json({ ok: true, id, photos: stored.length }, 200, origin)
      : done(true, origin, site);
  },
};
