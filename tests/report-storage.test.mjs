import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../functions/_lib/report-storage.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { checkReportSchema, findReportPhoto, listPublicReports, reportStorage, saveReport } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const caseSource = await readFile(new URL("../functions/_lib/ntu-case.ts", import.meta.url), "utf8");
const caseCompiled = ts.transpileModule(caseSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { caseIdFromRedirect, fetchPublicCaseNumber, findPublicCaseId, parsePublicCase } = await import(
  `data:text/javascript;base64,${Buffer.from(caseCompiled).toString("base64")}`
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
  assert.deepEqual(writes.row.slice(14, 18), [0, "opt-out", "opt-out", "opt-out"]);
  assert.deepEqual(writes.row.slice(18), [null, null]);
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
  assert.deepEqual(writes.row.slice(14, 18), [1, "Test Name", "0912345678", "test@example.com"]);
});

test("stores a verified NTU case number and detail id", async () => {
  const { writes, storage, form, image } = fixture(false);
  await saveReport(storage, form, image, { id: "171234", number: "MA11504000" });
  assert.deepEqual(writes.row.slice(18), ["MA11504000", "171234"]);
});

test("removes an uploaded photo when D1 insert fails", async () => {
  const { writes, storage, form, image } = fixture(false, true);
  await assert.rejects(saveReport(storage, form, image), /D1 failed/);
  assert.equal(writes.deletedKey, writes.photo.key);
  assert.equal(writes.index, null);
});

test("public report queries exclude contact fields and find photos by report id", async () => {
  const queries = [];
  const database = {
    prepare(sql) {
      queries.push(sql);
      return {
        async first() {
          return sql.includes("COUNT")
            ? { total: 1 }
            : { photo_key: "reports/report-id/photo", photo_content_type: "image/jpeg" };
        },
        async all() {
          return { results: [{ id: "report-id", location_note: "front gate" }] };
        },
        bind(id) {
          assert.equal(id, "report-id");
          return this;
        },
      };
    },
  };

  const result = await listPublicReports(database);
  const photo = await findReportPhoto(database, "report-id");

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].location_note, "front gate");
  assert.equal(photo.photo_key, "reports/report-id/photo");
  assert.match(queries[1], /LIMIT 100/);
  assert.match(queries[1], /school_case_number, school_case_id/);
  assert.doesNotMatch(queries[1], /applicant_name|applicant_phone|applicant_email|save_contact_info/i);
});

test("accepts only public NTU detail redirects and reads the case number", async (t) => {
  assert.equal(caseIdFromRedirect("/repairservice2/PublicRepair/Details?caseId=171234"), "171234");
  assert.equal(caseIdFromRedirect("https://my.ntu.edu.tw/repairservice2/PublicRepair/Details?caseId=171234"), "171234");
  assert.equal(caseIdFromRedirect("https://example.com/repairservice2/PublicRepair/Details?caseId=171234"), null);
  assert.equal(caseIdFromRedirect("/repairservice2/PublicRepair/List?caseId=171234"), null);
  assert.equal(caseIdFromRedirect("/repairservice2/PublicRepair/Details?caseId=abc"), null);

  const detail = `<title>MA11504000 - 公設修繕編輯</title>
    <h2><a href="/repairservice2/PublicRepair/Details?caseId=171234">MA11504000</a></h2>
    <div><div class="bg-c-yellow2 rounded p-1 d-inline-block">公設</div>
    <div class="bg-c-yellow2 rounded p-1 d-inline-block">處理中</div></div><br />
    <label class="control-label">申請日期</label><div class="form-control-plaintext">2026/11/10 18:20:54</div>
    <label for="Location">報修地點</label><div>博雅教學館西側</div>
    <label for="BrokenItem">申報項目</label><div>路面</div>
    <label for="Reason">申報事由</label><div>地磚不平 &amp; 鬆動</div>`;
  assert.deepEqual(parsePublicCase("171234", detail), {
    caseId: "171234", caseNumber: "MA11504000", status: "處理中",
    submittedAt: "2026/11/10 18:20:54", location: "博雅教學館西側",
    item: "路面", reason: "地磚不平 & 鬆動",
    unacceptedReason: "", returnedReason: "",
    detailUrl: "https://my.ntu.edu.tw/repairservice2/PublicRepair/Details?caseId=171234",
  });

  const rejectedDetail = detail.replace("處理中", "已不受理") + `
    <div><h3>不受理說明</h3><div>已有舊案申請，另本案已115年9月30日修繕完成。</div></div>
    <div><h3>退件說明</h3><div>請改由管理單位申請。</div></div>`;
  assert.deepEqual(
    (({ status, unacceptedReason, returnedReason }) => ({ status, unacceptedReason, returnedReason }))(
      parsePublicCase("171234", rejectedDetail),
    ),
    {
      status: "已不受理",
      unacceptedReason: "已有舊案申請，另本案已115年9月30日修繕完成。",
      returnedReason: "請改由管理單位申請。",
    },
  );

  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("/PublicRepair/List?")) {
      assert.match(String(url), /keyWord=MA11504000/);
      return new Response(`<a href="/repairservice2/PublicRepair/Details?caseId=171234">MA11504000</a>`);
    }
    assert.equal(String(url), "https://my.ntu.edu.tw/repairservice2/PublicRepair/Details?caseId=171234");
    return new Response(detail);
  });
  assert.equal(await findPublicCaseId("MA11504000"), "171234");
  assert.equal(await fetchPublicCaseNumber("171234"), "MA11504000");
});
