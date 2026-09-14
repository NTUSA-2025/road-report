import { NextResponse } from "next/server";
import {
  captchaUrl,
  mergeCookieHeaders,
  ntuUrl,
  readRepairSession,
  writeRepairSession,
} from "../../ntu";

export async function POST(request: Request) {
  const session = readRepairSession(request);

  if (!session) {
    return NextResponse.json(
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
    return NextResponse.json(
      { error: "無法更換 NTU 驗證碼。" },
      { status: 502 },
    );
  }

  const response = NextResponse.json({
    captchaUrl: captchaUrl(),
  });
  writeRepairSession(response, {
    ...session,
    cookies: mergeCookieHeaders(session.cookies, ntuResponse),
    capId,
  });

  return response;
}
