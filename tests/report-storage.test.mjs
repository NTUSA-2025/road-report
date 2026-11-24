import assert from "node:assert/strict";
import test from "node:test";
import { fakeKv } from "./helpers/fake-kv.mjs";
import { loadTs } from "./helpers/load-ts.mjs";

const { listPublicReports, readIndex, reportStorage, saveReport } = await loadTs("../../worker/lib/report-storage.ts");
const { caseIdFromRedirect, parsePublicCase } = await loadTs("../../worker/lib/ntu-case.ts");

function fixture(saveContactInfo, { failRecord = false, kvEntries = {} } = {}) {
  const writes = { photo: null, deletedKey: null };
  const kv = fakeKv(kvEntries);
  if (failRecord) {
    const put = kv.put;
    kv.put = async (key, value) => {
      if (key.startsWith("report:")) throw new Error("KV failed");
      return put(key, value);
    };
  }
  const storage = reportStorage({
    REPORTS: kv,
    PHOTOS: {
      async put(key, bytes, options) {
        writes.photo = { key, bytes, options };
      },
      async delete(key) {
        writes.deletedKey = key;
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
  return { kv, writes, storage, form, image };
}

test("requires both KV and R2 bindings", () => {
  assert.throws(() => reportStorage({ REPORTS: fakeKv() }), /Missing report storage binding/);
});

test("saves the report record, photo and index entry, replacing opted-out contacts", async () => {
  const { kv, writes, storage, form, image } = fixture(false);
  const id = await saveReport(storage, form, image);
  const record = kv.json(`report:${id}`);

  assert.equal(record.id, id);
  assert.equal(record.status, "submitted");
  assert.deepEqual(
    [record.itemId, record.reason, record.locationNote, record.latitude, record.longitude],
    ["5", "broken pavement", "front gate", 25.01734, 121.53975],
  );
  assert.deepEqual(record.imageTaken, { year: 2026, month: 10, day: 5 });
  assert.deepEqual(record.applicant, { name: "opt-out", phone: "opt-out", email: "opt-out" });
  assert.equal(record.saveContactInfo, false);
  assert.deepEqual(record.photo, { key: `reports/${id}/photo`, name: "street.jpg", contentType: "image/jpeg", size: 5 });
  assert.equal(record.schoolCaseId, null);
  assert.equal(writes.photo.key, `reports/${id}/photo`);
  assert.equal(writes.photo.options.httpMetadata.contentType, "image/jpeg");
  assert.equal(new TextDecoder().decode(writes.photo.bytes), "photo");

  const [summary] = kv.json("reports:index").reports;
  assert.equal(summary.id, id);
  assert.equal(summary.locationNote, "front gate");
  assert.doesNotMatch(kv.store.get("reports:index"), /applicant|opt-out|street\.jpg/);
});

test("stores trimmed contacts when consent is on", async () => {
  const { kv, storage, form, image } = fixture(true);
  const id = await saveReport(storage, form, image);
  const record = kv.json(`report:${id}`);
  assert.equal(record.saveContactInfo, true);
  assert.deepEqual(record.applicant, { name: "Test Name", phone: "0912345678", email: "test@example.com" });
  assert.doesNotMatch(kv.store.get("reports:index"), /Test Name|0912345678|test@example.com/);
});

test("stores the NTU case and its progress in the record and index", async () => {
  const { kv, storage, form, image } = fixture(false);
  const progress = { status: "處理中", unacceptedReason: "", returnedReason: "" };
  const id = await saveReport(storage, form, image, {
    id: "171234", number: "MA11504000", progress, checkedAt: "2026-11-24T00:00:00.000Z",
  });
  for (const report of [kv.json(`report:${id}`), kv.json("reports:index").reports[0]]) {
    assert.equal(report.schoolCaseId, "171234");
    assert.equal(report.schoolCaseNumber, "MA11504000");
    assert.deepEqual(report.schoolProgress, progress);
    assert.equal(report.schoolCheckedAt, "2026-11-24T00:00:00.000Z");
  }
});

test("removes the uploaded photo when the record write fails", async () => {
  const { kv, writes, storage, form, image } = fixture(false, { failRecord: true });
  await assert.rejects(saveReport(storage, form, image), /KV failed/);
  assert.equal(writes.deletedKey, writes.photo.key);
  assert.equal(kv.store.has("reports:index"), false);
});

test("keeps the index newest first and lists at most 100 reports with the full total", async () => {
  const older = Array.from({ length: 120 }, (_, i) => ({
    id: `r${i}`, createdAt: `2026-10-01T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0")}Z`,
    status: "submitted", itemId: "5", reason: "x", locationNote: `n${i}`, latitude: 25, longitude: 121,
    schoolCaseId: null, schoolCaseNumber: null, schoolProgress: null, schoolCheckedAt: null,
  }));
  const { kv, storage, form, image } = fixture(false, {
    kvEntries: { "reports:index": { reports: [...older, { id: "legacy", createdAt: "2026-10-05", status: "submitted" }] } },
  });
  const id = await saveReport(storage, form, image);

  const index = await readIndex(kv);
  assert.equal(index.length, 121);
  assert.equal(index[0].id, id);
  assert.ok(!index.some((report) => report.id === "legacy"));

  const { total, reports } = await listPublicReports(kv);
  assert.equal(total, 121);
  assert.equal(reports.length, 100);
});

test("returns an empty overview before any report is saved", async () => {
  assert.deepEqual(await listPublicReports(fakeKv()), { total: 0, reports: [] });
});

test("accepts only public NTU detail redirects and parses case details", () => {
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
});
