#!/usr/bin/env node
/**
 * Read the pending field reports, and pull one down to work on.
 *
 *   node scripts/reports.mjs list
 *   node scripts/reports.mjs get <id>
 *   node scripts/reports.mjs done <id>
 *
 * WHY THIS IS A LOCAL SCRIPT AND NOT AN ADMIN PAGE
 *
 * An admin page needs a login, a session, and a route that can write to the
 * site. That is three new ways to be wrong, guarding a queue that receives a
 * few items a week. This talks to R2 through wrangler, which is already
 * authenticated as you, and it can only read and delete — there is no path
 * from here to a published page either.
 *
 * `get` drops the report and its photos into reports-inbox/, which is
 * gitignored. From there the normal pipeline applies: photos through
 * ./scripts/import-photo.sh, the text into the record's `reports[]` with
 * acceptedOn set to the day you accepted it. Nothing skips that.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BUCKET = "field-guide-reports";
const INBOX = "reports-inbox";

const wrangler = (args, opts = {}) =>
  execFileSync("npx", ["wrangler", ...args], { encoding: "buffer", ...opts });

const text = (args) => wrangler(args).toString("utf8");

function list() {
  /* `r2 object list` isn't available in every wrangler line, so this walks the
     keys the same way the bucket is laid out: pending/<site>/<id>/report.json */
  let raw;
  try {
    raw = text(["r2", "bucket", "list", BUCKET, "--prefix", "pending/"]);
  } catch {
    console.error(
      "Couldn't list the bucket. Check `npx wrangler whoami`, and that the\n" +
        `bucket "${BUCKET}" exists.`,
    );
    process.exit(1);
  }
  const ids = [...new Set([...raw.matchAll(/pending\/(\w+)\/([0-9]{4}-[0-9]{2}-[0-9]{2}-[a-f0-9]{8})\//g)].map((m) => `${m[1]}/${m[2]}`))];
  if (!ids.length) {
    console.log("Nothing pending.");
    return;
  }
  console.log(`${ids.length} pending:\n`);
  for (const id of ids) console.log(`  ${id}`);
  console.log(`\nPull one down with:  node scripts/reports.mjs get <id>`);
}

function get(id) {
  if (!id || !id.includes("/")) {
    console.error("Give the full id, e.g. deepcreek/2026-08-06-1a2b3c4d");
    process.exit(1);
  }
  const dir = join(INBOX, id.replace("/", "-"));
  mkdirSync(dir, { recursive: true });

  const report = wrangler(["r2", "object", "get", `${BUCKET}/pending/${id}/report.json`, "--pipe"]);
  const parsed = JSON.parse(report.toString("utf8"));
  writeFileSync(join(dir, "report.json"), report);

  for (const p of parsed.photos ?? []) {
    const bytes = wrangler(["r2", "object", "get", `${BUCKET}/pending/${id}/${p.name}`, "--pipe"]);
    writeFileSync(join(dir, p.name), bytes);
  }

  console.log(`\n  ${parsed.subject ?? "(no subject)"}   ${parsed.path ?? ""}`);
  console.log(`  from ${parsed.from ?? "anonymous"}${parsed.email ? ` <${parsed.email}>` : ""}`);
  console.log(`  visited ${parsed.visitedOn ?? "(not given)"}, received ${parsed.receivedOn.slice(0, 10)}`);
  console.log(`\n${parsed.what.replace(/^/gm, "  ")}\n`);
  console.log(`  ${(parsed.photos ?? []).length} photo(s) → ${dir}\n`);
  console.log("  Photos go through ./scripts/import-photo.sh like any other.");
  console.log("  The text becomes a dated entry in the record's reports[], with acceptedOn set.");
  console.log(`  When it's in the data:  node scripts/reports.mjs done ${id}\n`);
}

function markDone(id) {
  if (!id || !id.includes("/")) {
    console.error("Give the full id, e.g. deepcreek/2026-08-06-1a2b3c4d");
    process.exit(1);
  }
  const raw = text(["r2", "bucket", "list", BUCKET, "--prefix", `pending/${id}/`]);
  const keys = [...new Set([...raw.matchAll(new RegExp(`pending/${id}/[\\w.-]+`, "g"))].map((m) => m[0]))];
  for (const key of keys) {
    wrangler(["r2", "object", "delete", `${BUCKET}/${key}`], { stdio: "ignore" });
    console.log(`  removed ${key}`);
  }
  console.log(`\n  ${id} cleared.`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "list") list();
else if (cmd === "get") get(arg);
else if (cmd === "done") markDone(arg);
else {
  console.log("usage: node scripts/reports.mjs list | get <id> | done <id>");
  process.exit(1);
}
