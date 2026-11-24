import { jsonResponse } from "../lib/http";
import { listPublicReports } from "../lib/report-storage";
import type { RouteHandler } from "../lib/env";

export const listReports: RouteHandler = async (request, env) => {
  if (!env.REPORTS) {
    return jsonResponse({ error: "回報資料暫時無法讀取。" }, { status: 503 });
  }

  try {
    const { total, reports } = await listPublicReports(env.REPORTS);
    return jsonResponse({
      total,
      reports: reports.map((report) => ({
        id: report.id,
        title: report.locationNote,
        description: report.reason,
        status: report.status === "submitted" ? "已送出" : report.status,
        itemId: report.itemId,
        schoolCaseId: report.schoolCaseId,
        schoolCaseNumber: report.schoolCaseNumber,
        schoolProgress: report.schoolProgress,
        photoUrl: `/api/reports/${encodeURIComponent(report.id)}/photo`,
        coordinates: { lat: report.latitude, lng: report.longitude, source: "map" },
        reportedAt: report.createdAt,
      })),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Failed to load reports", error);
    return jsonResponse({ error: "回報資料暫時無法讀取。" }, { status: 503 });
  }
};
