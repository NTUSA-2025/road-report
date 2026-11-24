import { jsonResponse } from "../lib/http";
import { FORWARD_TO_NTU, isRepairSubmitEnabled } from "../lib/feature-flags";
import {
  appendRepairSessionCookie,
  createPath,
  fetchCreateSession,
  mergeCookieHeaders,
  readRepairSession,
} from "../lib/ntu";
import { reportStorage, saveReport, type ReportStorage, type SchoolCase } from "../lib/report-storage";
import { caseIdFromRedirect, fetchPublicCase } from "../lib/ntu-case";
import type { RouteHandler } from "../lib/env";

// This site only takes road reports, so the NTU item is fixed to 路面 regardless of what the client sends.
const ROAD_ITEM_ID = "5";

const REQUIRED_FIELDS = [
  "ApplicantPhone",
  "Latitude",
  "Longitude",
  "LocationNote",
  "Reason",
  "CapAns",
];

export const submitRepair: RouteHandler = async (request, env) => {
  if (FORWARD_TO_NTU && !isRepairSubmitEnabled(env)) {
    return jsonResponse(
      { error: "報修送出目前暫停開放，驗證碼與表單仍可先準備。" },
      { status: 403 },
    );
  }

  const session = readRepairSession(request);

  if (!session) {
    return jsonResponse(
      { error: "驗證碼工作階段已過期，請重新整理頁面後再送出。" },
      { status: 440 },
    );
  }

  const incoming = await request.formData();
  incoming.set("BrokenItemId", ROAD_ITEM_ID);
  const missing = REQUIRED_FIELDS.find((field) => !`${incoming.get(field) ?? ""}`.trim());
  const image = incoming.get("ImageFiles");
  const coordinates = coordinatesValue(incoming);

  if (missing || textValue(incoming, "CapAns").length !== 5 || !coordinates || !(image instanceof File) || image.size === 0) {
    return jsonResponse(
      { error: "請確認必填欄位、經緯度、照片與 5 碼驗證碼都已填寫。" },
      { status: 400 },
    );
  }

  let storage: ReportStorage;
  try {
    storage = reportStorage(env);
  } catch (error) {
    console.error("Report storage is unavailable", error);
    return jsonResponse(
      { error: "本站資料儲存功能尚未準備好，請稍後再送出。" },
      { status: 503 },
    );
  }

  if (!FORWARD_TO_NTU) {
    try {
      const id = await saveReport(storage, incoming, image);
      return jsonResponse({ id, message: "已送出回報。" });
    } catch (error) {
      console.error("Failed to save test report", error);
      return jsonResponse(
        { error: "送出失敗，請稍後再試。" },
        { status: 500 },
      );
    }
  }

  const upstream = new FormData();
  upstream.set("__RequestVerificationToken", session.requestVerificationToken);
  upstream.set("ApplicantName", textValue(incoming, "ApplicantName"));
  upstream.set("ApplicantPhone", textValue(incoming, "ApplicantPhone"));
  upstream.set("ApplicantEmail", textValue(incoming, "ApplicantEmail"));
  const locationNote = textValue(incoming, "LocationNote");
  upstream.set("Location", `${locationNote}：${coordinates}`);
  upstream.set("BrokenItemId", textValue(incoming, "BrokenItemId"));
  upstream.set("Reason", textValue(incoming, "Reason"));
  upstream.set("ImageFiles", image, image.name);
  upstream.set("ImageTakenYear", textValue(incoming, "ImageTakenYear"));
  upstream.set("ImageTakenMonth", textValue(incoming, "ImageTakenMonth"));
  upstream.set("ImageTakenDay", textValue(incoming, "ImageTakenDay"));
  upstream.set("CapId", session.capId);
  upstream.set("CapAns", textValue(incoming, "CapAns"));

  const ntuResponse = await fetch(createPath(), {
    method: "POST",
    headers: {
      accept: "text/html,application/xhtml+xml",
      cookie: session.cookies,
      origin: "https://my.ntu.edu.tw",
      referer: createPath(),
      "user-agent": "road-report/0.1",
    },
    redirect: "manual",
    body: upstream,
  });

  const location = ntuResponse.headers.get("location") ?? "";

  const redirected = ntuResponse.status >= 300 && ntuResponse.status < 400;

  if (!redirected) {
    const html = await ntuResponse.text();
    const validationError = extractValidationError(html);

    if (!ntuResponse.ok || validationError) {
      const fresh = await fetchCreateSession().catch(() => null);
      const headers = new Headers();

      if (fresh) {
        appendRepairSessionCookie(headers, request, fresh.session);
      } else {
        appendRepairSessionCookie(headers, request, {
          ...session,
          cookies: mergeCookieHeaders(session.cookies, ntuResponse),
        });
      }

      return jsonResponse(
        {
          error:
            validationError ||
            "NTU 表單沒有接受這次送出，請檢查欄位或重新輸入驗證碼。",
        },
        { status: 422, headers },
      );
    }
  }

  const schoolCaseId = redirected ? caseIdFromRedirect(location) : null;
  const schoolCase = schoolCaseId ? await readSchoolCase(schoolCaseId) : null;
  const schoolCaseNumber = schoolCase?.number ?? null;

  try {
    const id = await saveReport(storage, incoming, image, schoolCase);
    return jsonResponse({
      id,
      schoolCaseId,
      schoolCaseNumber,
      message: redirected
        ? "NTU 報修表單已接受送出，請留意通知信或後續查詢頁。"
        : "已送出到 NTU 報修表單。",
      ...(redirected ? { redirect: location } : {}),
    });
  } catch (error) {
    console.error("NTU accepted report, but local save failed", error);
    return jsonResponse({
      message: "學校已收到報修，但本站未能保存回報資料。請勿重複送出。",
      schoolCaseId,
      schoolCaseNumber,
      ...(redirected ? { redirect: location } : {}),
    });
  }
};

// A failed read still keeps the case id; the scheduled sync fills in the rest.
async function readSchoolCase(id: string): Promise<SchoolCase> {
  try {
    const { caseNumber, status, unacceptedReason, returnedReason } = await fetchPublicCase(id);
    return {
      id,
      number: caseNumber,
      progress: { status, unacceptedReason, returnedReason },
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to read NTU case details", id, error);
    return { id, number: null, progress: null, checkedAt: null };
  }
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function coordinatesValue(formData: FormData) {
  const lat = textValue(formData, "Latitude");
  const lng = textValue(formData, "Longitude");
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function extractValidationError(html: string) {
  if (/驗證碼錯誤|field-validation-error|validation-summary-errors/i.test(html)) {
    return "NTU 表單回覆驗證未通過，請重新輸入新的驗證碼。";
  }

  if (/公共設施報修申請 Application form/.test(html)) {
    return "NTU 表單回到填寫頁，可能有欄位未通過檢查。";
  }

  return "";
}
