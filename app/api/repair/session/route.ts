import { NextResponse } from "next/server";
import { captchaUrl, fetchCreateSession, writeRepairSession } from "../ntu";

export async function POST() {
  try {
    const { session, items } = await fetchCreateSession();
    const response = NextResponse.json({
      captchaUrl: captchaUrl(),
      items,
    });
    writeRepairSession(response, session);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "暫時無法連線到 NTU 報修表單。",
      },
      { status: 502 },
    );
  }
}
