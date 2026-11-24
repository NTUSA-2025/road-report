// One-off: export reports from the old local D1/R2 state (.wrangler/state) into the KV record
// format, and print the wrangler commands that upload them to production. It never touches
// remote resources itself; run the printed commands yourself.
//
// Usage: node scripts/migrate-local-report.mjs
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const state = join(root, ".wrangler/state/v3");
const outDir = join(root, ".wrangler/migrate");

const reports = readLocalReports(await findSqlite(join(state, "d1/miniflare-D1DatabaseObject"), "reports"));
if (reports.length === 0) {
  console.log("No reports found in the local D1 state.");
  process.exit(0);
}

const objectsDb = await findSqlite(join(state, "r2/miniflare-R2BucketObject"), "_mf_objects");
await mkdir(outDir, { recursive: true });

const commands = [];
for (const row of reports) {
  const photo = new DatabaseSync(objectsDb, { readOnly: true })
    .prepare("SELECT blob_id, size FROM _mf_objects WHERE key = ?")
    .get(row.photo_key);
  if (!photo) {
    throw new Error(`Photo ${row.photo_key} is missing from the local R2 state`);
  }

  const blob = join(state, "r2/road-report-r2/blobs", photo.blob_id);
  if ((await stat(blob)).size !== photo.size) {
    throw new Error(`Photo blob for ${row.id} does not match its recorded size`);
  }

  const photoFile = join(outDir, `${row.id}.photo`);
  const recordFile = join(outDir, `${row.id}.json`);
  await copyFile(blob, photoFile);
  await writeFile(recordFile, JSON.stringify(toRecord(row)));

  commands.push(
    `npx wrangler r2 object put "road-report-r2/${row.photo_key}" --file "${photoFile}" --content-type "${row.photo_content_type}" --remote`,
    `npx wrangler kv key put "report:${row.id}" --path "${recordFile}" --binding REPORTS --remote`,
  );
  console.log(`Prepared ${row.id} (${row.location_note}${row.school_case_number ? `, ${row.school_case_number}` : ""})`);
}

console.log(`
Files written to ${outDir}

Then run:

${commands.join("\n")}

Old-format keys (report:{id} with only id/createdAt/status) can be listed and removed with:
npx wrangler kv key list --binding REPORTS --remote
npx wrangler kv key delete "report:<old id>" --binding REPORTS --remote

Uploaded records are not added to reports:index automatically; add their summaries to the index
before they show up in the overview. The hourly cron then fills in their NTU status.`);

async function findSqlite(dir, table) {
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".sqlite") || name === "metadata.sqlite") continue;
    const db = new DatabaseSync(join(dir, name), { readOnly: true });
    const found = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    db.close();
    if (found) return join(dir, name);
  }
  throw new Error(`No local sqlite file in ${dir} has a ${table} table`);
}

function readLocalReports(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  const rows = db.prepare("SELECT * FROM reports ORDER BY created_at").all();
  db.close();
  return rows;
}

function toRecord(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    itemId: row.broken_item_id,
    reason: row.reason,
    locationNote: row.location_note,
    latitude: row.latitude,
    longitude: row.longitude,
    schoolCaseId: row.school_case_id ?? null,
    schoolCaseNumber: row.school_case_number ?? null,
    schoolProgress: null,
    schoolCheckedAt: null,
    imageTaken: {
      year: row.image_taken_year ?? null,
      month: row.image_taken_month ?? null,
      day: row.image_taken_day ?? null,
    },
    photo: {
      key: row.photo_key,
      name: row.photo_name,
      contentType: row.photo_content_type,
      size: row.photo_size,
    },
    saveContactInfo: row.save_contact_info === 1,
    applicant: {
      name: row.applicant_name,
      phone: row.applicant_phone,
      email: row.applicant_email,
    },
  };
}
