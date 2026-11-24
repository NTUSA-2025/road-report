import assert from "node:assert/strict";
import test from "node:test";
import { fakeKv } from "./helpers/fake-kv.mjs";
import { loadTs } from "./helpers/load-ts.mjs";

const { syncReports } = await loadTs("../../worker/sync.ts");

const NOW = new Date("2026-11-24T12:00:00.000Z");
const HOURS = 60 * 60 * 1000;

function summary(id, overrides = {}) {
  return {
    id, createdAt: `2026-11-01T00:00:00.000Z`, status: "submitted", itemId: "5", reason: "x",
    locationNote: id, latitude: 25, longitude: 121,
    schoolCaseId: null, schoolCaseNumber: null, schoolProgress: null, schoolCheckedAt: null,
    ...overrides,
  };
}

function record(report) {
  return {
    ...report,
    imageTaken: { year: null, month: null, day: null },
    photo: { key: `reports/${report.id}/photo`, name: "p.jpg", contentType: "image/jpeg", size: 1 },
    saveContactInfo: false,
    applicant: { name: "opt-out", phone: "opt-out", email: "opt-out" },
  };
}

function store(reports) {
  return fakeKv({
    "reports:index": { reports },
    ...Object.fromEntries(reports.map((report) => [`report:${report.id}`, record(report)])),
  });
}

const progress = (status) => ({ status, unacceptedReason: "", returnedReason: "" });

test("checks open cases, skips closed or recently checked ones, and records changes", async () => {
  const reports = [
    summary("new", { schoolCaseId: "1" }),
    summary("stale", { schoolCaseId: "2", schoolCaseNumber: "MA2", schoolProgress: progress("已送出"), schoolCheckedAt: new Date(NOW - 24 * HOURS).toISOString() }),
    summary("fresh", { schoolCaseId: "3", schoolProgress: progress("處理中"), schoolCheckedAt: new Date(NOW - 2 * HOURS).toISOString() }),
    summary("closed", { schoolCaseId: "4", schoolProgress: progress("已結案") }),
    summary("rejected", { schoolCaseId: "5", schoolProgress: progress("已不受理") }),
    summary("local-only"),
  ];
  const kv = store(reports);
  const fetched = [];
  const result = await syncReports(kv, NOW, async (caseId) => {
    fetched.push(caseId);
    return { caseNumber: `MA${caseId}`, ...progress(caseId === "1" ? "處理中" : "已送出") };
  });

  assert.deepEqual(fetched.sort(), ["1", "2"]);
  assert.deepEqual(result, { checked: 2 });

  const index = Object.fromEntries(kv.json("reports:index").reports.map((report) => [report.id, report]));
  assert.deepEqual(index.new.schoolProgress, progress("處理中"));
  assert.equal(index.new.schoolCaseNumber, "MA1");
  assert.equal(index.new.schoolCheckedAt, NOW.toISOString());
  assert.equal(index.stale.schoolCheckedAt, NOW.toISOString());
  assert.equal(index.fresh.schoolCheckedAt, reports[2].schoolCheckedAt);

  // Only reports whose progress actually changed get their record rewritten.
  assert.deepEqual(kv.json("report:new").schoolProgress, progress("處理中"));
  assert.ok(!kv.writes.includes("report:stale"));
  assert.equal(kv.writes.filter((key) => key === "reports:index").length, 1);
});

test("checks at most 20 cases per run, least recently checked first", async () => {
  const reports = Array.from({ length: 25 }, (_, i) => summary(`r${i}`, {
    schoolCaseId: String(i + 1),
    schoolProgress: progress("處理中"),
    schoolCheckedAt: new Date(NOW - (30 + i) * HOURS).toISOString(),
  }));
  const kv = store(reports);
  const fetched = [];
  await syncReports(kv, NOW, async (caseId) => {
    fetched.push(Number(caseId));
    return { caseNumber: "", ...progress("處理中") };
  });

  assert.equal(fetched.length, 20);
  assert.deepEqual(fetched.sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 6));
});

test("keeps the last known status when the NTU page cannot be read", async () => {
  const kv = store([summary("r", { schoolCaseId: "9", schoolProgress: progress("處理中") })]);
  const originalError = console.error;
  console.error = () => {};
  try {
    await syncReports(kv, NOW, async () => {
      throw new Error("NTU down");
    });
  } finally {
    console.error = originalError;
  }

  const [report] = kv.json("reports:index").reports;
  assert.deepEqual(report.schoolProgress, progress("處理中"));
  assert.equal(report.schoolCheckedAt, NOW.toISOString());
});

test("does not write the index when nothing changed", async () => {
  const kv = store([summary("r")]);
  await syncReports(kv, NOW, async () => assert.fail("no case should be fetched"));
  assert.deepEqual(kv.writes, []);
});
