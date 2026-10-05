import { jsonResponse, methodNotAllowed } from "../../_lib/http";
import { listPublicReports, type ReportStorageEnv } from "../../_lib/report-storage";
import type { PagesContext } from "../../_lib/types";

export async function onRequestGet({ env }: PagesContext<ReportStorageEnv>) {
  const database = env["road-report-db"];

  if (!database) {
    return jsonResponse({ error: "回報資料暫時無法讀取。" }, { status: 503 });
  }

  try {
    const { total, rows } = await listPublicReports(database);
    return jsonResponse({
      total,
      reports: rows.map((row) => ({
        id: row.id,
        title: row.location_note,
        description: row.reason,
        status: row.status === "submitted" ? "已送出" : row.status,
        itemId: row.broken_item_id,
        photoUrl: `/api/reports/${encodeURIComponent(row.id)}/photo`,
        coordinates: { lat: row.latitude, lng: row.longitude, source: "map" },
        reportedAt: row.created_at,
      })),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Failed to load reports", error);
    return jsonResponse({ error: "回報資料暫時無法讀取。" }, { status: 503 });
  }
}

export function onRequestPost() {
  return methodNotAllowed(["GET"]);
}
