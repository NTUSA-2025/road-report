import { jsonResponse, methodNotAllowed } from "../../../_lib/http";
import {
  appendRepairSessionCookie,
  captchaUrl,
  fetchCaptchaImageDataUrl,
  mergeCookieHeaders,
  ntuUrl,
  readRepairSession,
} from "../../../_lib/ntu";
import type { PagesContext } from "../../../_lib/types";

export async function onRequestPost({ request }: PagesContext) {
  const session = readRepairSession(request);

  if (!session) {
    return jsonResponse(
      { error: "驗證碼工作階段已過期，請重新整理頁面。" },
      { status: 440 },
    );
  }

  const body = new URLSearchParams();
  body.set("capId", session.capId);

  const ntuResponse = await fetch(ntuUrl("/repairservice2/Captcha/Change"), {
    method: "POST",
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      cookie: session.cookies,
      origin: "https://my.ntu.edu.tw",
      referer: ntuUrl("/repairservice2/PublicRepair/Create"),
      "user-agent": "road-report/0.1",
      "x-requested-with": "XMLHttpRequest",
    },
    body,
  });
  const payload = (await ntuResponse.json().catch(() => null)) as { capId?: string } | null;
  const capId = payload?.capId;

  if (!ntuResponse.ok || !capId) {
    return jsonResponse(
      { error: "無法更換 NTU 驗證碼。" },
      { status: 502 },
    );
  }

  const refreshedSession = {
    ...session,
    cookies: mergeCookieHeaders(session.cookies, ntuResponse),
    capId,
  };
  const captchaImageUrl = await fetchCaptchaImageDataUrl(refreshedSession).catch(() => "");

  if (!captchaImageUrl) {
    return jsonResponse(
      { error: "無法取得 NTU 驗證碼圖片。" },
      { status: 502 },
    );
  }

  const headers = new Headers();
  appendRepairSessionCookie(headers, request, refreshedSession);

  return jsonResponse(
    {
      captchaUrl: captchaImageUrl,
      captchaProxyUrl: captchaUrl(),
    },
    { headers },
  );
}

export function onRequestGet() {
  return methodNotAllowed(["POST"]);
}
