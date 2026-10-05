import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../functions/_lib/report-storage.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { checkReportSchema, reportStorage, saveReport } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

function fixture(saveContactInfo, failInsert = false) {
  const writes = { row: null, photo: null, index: null, deletedKey: null };
  const database = {
    prepare(sql) {
      if (sql.includes("SELECT")) {
        return { first: async () => null };
      }
      assert.match(sql, /INSERT INTO reports/);
      return {
        bind(...values) {
          writes.row = values;
          return this;
        },
        async run() {
          if (failInsert) throw new Error("D1 failed");
          return { success: true };
        },
      };
    },
  };
  const storage = reportStorage({
    "road-report-db": database,
    "road-report-r2": {
      async put(key, bytes, options) {
        writes.photo = { key, bytes, options };
      },
      async delete(key) {
        writes.deletedKey = key;
      },
    },
    ROAD_REPORT_KV: {
      async put(key, value) {
        writes.index = { key, value };
      },
    },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    SaveContactInfo: String(saveContactInfo),
    ApplicantName: "  Test Name  ",
    ApplicantPhone: " 0912345678 ",
    ApplicantEmail: " test@example.com ",
    BrokenItemId: "5",
    Reason: "broken pavement",
    LocationNote: "front gate",
    Latitude: "25.017340",
    Longitude: "121.539750",
    ImageTakenYear: "2026",
    ImageTakenMonth: "10",
    ImageTakenDay: "5",
  })) form.set(key, value);
  const image = new File(["photo"], "street.jpg", { type: "image/jpeg" });
  return { writes, storage, form, image };
}

test("saves report fields and replaces opted-out contacts in D1", async () => {
  const { writes, storage, form, image } = fixture(false);
  await checkReportSchema(storage.database);
  const id = await saveReport(storage, form, image);

  assert.equal(writes.row[0], id);
  assert.deepEqual(writes.row.slice(2, 10), [
    "5", "broken pavement", "front gate", 25.01734, 121.53975, 2026, 10, 5,
  ]);
  assert.deepEqual(writes.row.slice(-4), [0, "opt-out", "opt-out", "opt-out"]);
  assert.equal(writes.photo.key, `reports/${id}/photo`);
  assert.equal(writes.photo.options.httpMetadata.contentType, "image/jpeg");
  assert.equal(new TextDecoder().decode(writes.photo.bytes), "photo");
  assert.equal(writes.index.key, `report:${id}`);
  assert.deepEqual(Object.keys(JSON.parse(writes.index.value)).sort(), ["createdAt", "id", "status"]);
  assert.doesNotMatch(writes.index.value, /Test Name|0912345678|test@example.com/);
});

test("stores trimmed contacts when consent is on", async () => {
  const { writes, storage, form, image } = fixture(true);
  await saveReport(storage, form, image);
  assert.deepEqual(writes.row.slice(-4), [1, "Test Name", "0912345678", "test@example.com"]);
});

test("removes an uploaded photo when D1 insert fails", async () => {
  const { writes, storage, form, image } = fixture(false, true);
  await assert.rejects(saveReport(storage, form, image), /D1 failed/);
  assert.equal(writes.deletedKey, writes.photo.key);
  assert.equal(writes.index, null);
});
