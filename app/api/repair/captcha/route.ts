import { NextResponse } from "next/server";
import { ntuUrl, readRepairSession } from "../ntu";

export async function GET(request: Request) {
  const session = readRepairSession(request);

  if (!session) {
    return NextResponse.json(
      { error: "驗證碼工作階段已過期，請重新整理頁面。" },
      { status: 440 },
    );
  }

  const response = await fetch(
    ntuUrl(`/repairservice2/Captcha/Img?capId=${encodeURIComponent(session.capId)}`),
    {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        cookie: session.cookies,
        referer: ntuUrl("/repairservice2/PublicRepair/Create"),
        "user-agent": "road-report/0.1",
      },
    },
  );

  if (!response.ok || !response.body) {
    return NextResponse.json(
      { error: "無法取得 NTU 驗證碼圖片。" },
      { status: 502 },
    );
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "cache-control": "no-store",
      "content-type": response.headers.get("content-type") ?? "image/png",
    },
  });
}
