import { jsonResponse, methodNotAllowed } from "../../_lib/http";
import { fetchPublicCase, findPublicCaseId } from "../../_lib/ntu-case";
import type { PagesContext } from "../../_lib/types";

export async function onRequestGet({ request }: PagesContext) {
  const search = new URL(request.url).searchParams;
  const caseId = search.get("caseId")?.trim() ?? "";
  const caseNumber = search.get("caseNumber")?.trim().toUpperCase() ?? "";

  if (Boolean(caseId) === Boolean(caseNumber) ||
      (caseId && !/^[1-9]\d*$/.test(caseId)) ||
      (caseNumber && !/^[A-Z]{2}\d{6,}$/.test(caseNumber))) {
    return jsonResponse({ error: "請提供有效的臺大案件 ID 或案號。" }, { status: 400 });
  }

  try {
    const resolvedId = caseId || await findPublicCaseId(caseNumber);
    if (!resolvedId) {
      return jsonResponse({ error: "找不到這筆臺大案件，請確認案號。" }, { status: 404 });
    }
    const report = await fetchPublicCase(resolvedId);
    if (caseNumber && report.caseNumber.toUpperCase() !== caseNumber) {
      return jsonResponse({ error: "找不到這筆臺大案件，請確認案號。" }, { status: 404 });
    }
    return jsonResponse({ report, checkedAt: new Date().toISOString() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load NTU repair progress", error);
    return jsonResponse({ error: "暫時無法讀取臺大案件進度，請稍後再試。" }, { status: 502 });
  }
}

export function onRequestPost() {
  return methodNotAllowed(["GET"]);
}
