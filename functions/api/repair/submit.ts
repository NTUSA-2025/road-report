import { jsonResponse, methodNotAllowed } from "../../_lib/http";
import {
  appendRepairSessionCookie,
  createPath,
  fetchCreateSession,
  mergeCookieHeaders,
  readRepairSession,
} from "../../_lib/ntu";
import type { PagesContext } from "../../_lib/types";

const REQUIRED_FIELDS = [
  "ApplicantPhone",
  "Latitude",
  "Longitude",
  "BrokenItemId",
  "Reason",
  "CapAns",
];

export async function onRequestPost({ request }: PagesContext) {
  const session = readRepairSession(request);

  if (!session) {
    return jsonResponse(
      { error: "驗證碼工作階段已過期，請重新整理頁面後再送出。" },
      { status: 440 },
    );
  }

  const incoming = await request.formData();
  const missing = REQUIRED_FIELDS.find((field) => !`${incoming.get(field) ?? ""}`.trim());
  const image = incoming.get("ImageFiles");

  if (missing || !coordinatesValue(incoming) || !(image instanceof File) || image.size === 0) {
    return jsonResponse(
      { error: "請確認必填欄位、經緯度、照片與驗證碼都已填寫。" },
      { status: 400 },
    );
  }

  const upstream = new FormData();
  upstream.set("__RequestVerificationToken", session.requestVerificationToken);
  upstream.set("ApplicantName", textValue(incoming, "ApplicantName"));
  upstream.set("ApplicantPhone", textValue(incoming, "ApplicantPhone"));
  upstream.set("ApplicantEmail", textValue(incoming, "ApplicantEmail"));
  upstream.set("Location", coordinatesValue(incoming) ?? "");
  upstream.set("BrokenItemId", textValue(incoming, "BrokenItemId"));
  upstream.set("Reason", textValue(incoming, "Reason"));
  upstream.set("ImageFiles", image, image.name);
  upstream.set("ImageTakenYear", textValue(incoming, "ImageTakenYear"));
  upstream.set("ImageTakenMonth", textValue(incoming, "ImageTakenMonth"));
  upstream.set("ImageTakenDay", textValue(incoming, "ImageTakenDay"));
  upstream.set("ImageDescription", textValue(incoming, "ImageDescription"));
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

  if (ntuResponse.status >= 300 && ntuResponse.status < 400) {
    return jsonResponse({
      message: "NTU 報修表單已接受送出，請留意通知信或後續查詢頁。",
      redirect: location,
    });
  }

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

  return jsonResponse({
    message: "已送出到 NTU 報修表單。",
  });
}

export function onRequestGet() {
  return methodNotAllowed(["POST"]);
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
