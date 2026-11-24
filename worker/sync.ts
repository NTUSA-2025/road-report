import { fetchPublicCase } from "./lib/ntu-case";
import {
  readIndex,
  readReport,
  writeIndex,
  writeReport,
  type ReportKV,
  type ReportSummary,
  type SchoolProgress,
} from "./lib/report-storage";

const FINAL_STATUSES = new Set(["已結案", "專簽結案", "已不受理"]);
const RECHECK_AFTER_MS = 23 * 60 * 60 * 1000;
// The cron runs hourly; a small batch keeps each run well under the Workers subrequest limit.
const BATCH_SIZE = 20;
const CONCURRENCY = 2;

type FetchCase = (caseId: string) => Promise<{ caseNumber: string } & SchoolProgress>;

export async function syncReports(kv: ReportKV, now = new Date(), fetchCase: FetchCase = fetchPublicCase) {
  const reports = await readIndex(kv);
  const due = casesToCheck(reports, now);
  const updates = new Map<string, ReportSummary>();
  let next = 0;
  async function worker() {
    while (next < due.length) {
      const report = due[next++];
      updates.set(report.id, await checkCase(kv, report, now, fetchCase));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker));

  if (updates.size > 0) {
    await writeIndex(kv, reports.map((report) => updates.get(report.id) ?? report));
  }

  return { checked: due.length };
}

export function casesToCheck(reports: ReportSummary[], now: Date) {
  const cutoff = now.getTime() - RECHECK_AFTER_MS;
  return reports
    .filter((report) => report.schoolCaseId &&
      !FINAL_STATUSES.has(report.schoolProgress?.status ?? "") &&
      (!report.schoolCheckedAt || Date.parse(report.schoolCheckedAt) < cutoff))
    .sort((a, b) => (a.schoolCheckedAt ?? "").localeCompare(b.schoolCheckedAt ?? ""))
    .slice(0, BATCH_SIZE);
}

async function checkCase(kv: ReportKV, report: ReportSummary, now: Date, fetchCase: FetchCase) {
  const checkedAt = now.toISOString();
  try {
    const { caseNumber, status, unacceptedReason, returnedReason } = await fetchCase(report.schoolCaseId!);
    const progress = { status, unacceptedReason, returnedReason };
    const updated = {
      ...report,
      schoolCaseNumber: caseNumber || report.schoolCaseNumber,
      schoolProgress: progress,
      schoolCheckedAt: checkedAt,
    };

    if (JSON.stringify(progress) !== JSON.stringify(report.schoolProgress) ||
        updated.schoolCaseNumber !== report.schoolCaseNumber) {
      const record = await readReport(kv, report.id);
      if (record) {
        await writeReport(kv, {
          ...record,
          schoolCaseNumber: updated.schoolCaseNumber,
          schoolProgress: progress,
          schoolCheckedAt: checkedAt,
        });
      }
    }
    return updated;
  } catch (error) {
    console.error("Failed to sync NTU case", report.schoolCaseId, error);
    return { ...report, schoolCheckedAt: checkedAt };
  }
}
