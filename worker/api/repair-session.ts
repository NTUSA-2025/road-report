import { jsonResponse } from "../lib/http";
import { FORWARD_TO_NTU, isRepairSubmitEnabled } from "../lib/feature-flags";
import {
  appendRepairSessionCookie,
  captchaUrl,
  fetchCaptchaImageDataUrl,
  fetchCreateSession,
} from "../lib/ntu";
import type { RouteHandler } from "../lib/env";

export const createRepairSession: RouteHandler = async (request, env) => {
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
        submitEnabled: !FORWARD_TO_NTU || isRepairSubmitEnabled(env),
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
};
