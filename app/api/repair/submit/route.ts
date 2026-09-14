import { NextResponse } from "next/server";
import {
  createPath,
  fetchCreateSession,
  mergeCookieHeaders,
  readRepairSession,
  writeRepairSession,
} from "../ntu";

const REQUIRED_FIELDS = [
  "ApplicantPhone",
  "Location",
  "BrokenItemId",
  "Reason",
  "CapAns",
];

export async function POST(request: Request) {
  const session = readRepairSession(request);

  if (!session) {
    return NextResponse.json(
      { error: "驗證碼工作階段已過期，請重新整理頁面後再送出。" },
      { status: 440 },
    );
  }

  const incoming = await request.formData();
  const missing = REQUIRED_FIELDS.find((field) => !`${incoming.get(field) ?? ""}`.trim());
  const image = incoming.get("ImageFiles");

  if (missing || !(image instanceof File) || image.size === 0) {
    return NextResponse.json(
      { error: "請確認必填欄位、照片與驗證碼都已填寫。" },
      { status: 400 },
    );
  }

  const upstream = new FormData();
  upstream.set("__RequestVerificationToken", session.requestVerificationToken);
  upstream.set("ApplicantName", textValue(incoming, "ApplicantName"));
  upstream.set("ApplicantPhone", textValue(incoming, "ApplicantPhone"));
  upstream.set("ApplicantEmail", textValue(incoming, "ApplicantEmail"));
  upstream.set("Location", withCoordinates(incoming));
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
    return NextResponse.json({
      message: "NTU 報修表單已接受送出，請留意通知信或後續查詢頁。",
      redirect: location,
    });
  }

  const html = await ntuResponse.text();
  const validationError = extractValidationError(html);

  if (!ntuResponse.ok || validationError) {
    const fresh = await fetchCreateSession().catch(() => null);
    const response = NextResponse.json(
      {
        error:
          validationError ||
          "NTU 表單沒有接受這次送出，請檢查欄位或重新輸入驗證碼。",
      },
      { status: 422 },
    );

    if (fresh) {
      writeRepairSession(response, fresh.session);
    } else {
      writeRepairSession(response, {
        ...session,
        cookies: mergeCookieHeaders(session.cookies, ntuResponse),
      });
    }

    return response;
  }

  return NextResponse.json({
    message: "已送出到 NTU 報修表單。",
  });
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function withCoordinates(formData: FormData) {
  const location = textValue(formData, "Location");
  const lat = textValue(formData, "Latitude");
  const lng = textValue(formData, "Longitude");

  if (!lat || !lng || location.includes(lat)) {
    return location;
  }

  return `${location}；座標 ${lat}, ${lng}`;
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
