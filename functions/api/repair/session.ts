import { jsonResponse, methodNotAllowed } from "../../_lib/http";
import {
  appendRepairSessionCookie,
  captchaUrl,
  fetchCaptchaImageDataUrl,
  fetchCreateSession,
} from "../../_lib/ntu";
import type { PagesContext } from "../../_lib/types";

export async function onRequestPost({ request }: PagesContext) {
  try {
    const { session, items } = await fetchCreateSession();
    const captchaImageUrl = await fetchCaptchaImageDataUrl(session);
    const headers = new Headers();
    appendRepairSessionCookie(headers, request, session);

    return jsonResponse(
      {
        captchaUrl: captchaImageUrl,
        captchaProxyUrl: captchaUrl(),
        items,
      },
      { headers },
    );
  } catch (error) {
    return jsonResponse(
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

export function onRequestGet() {
  return methodNotAllowed(["POST"]);
}
