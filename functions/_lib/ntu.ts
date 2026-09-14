const NTU_ORIGIN = "https://my.ntu.edu.tw";
const CREATE_PATH = "/repairservice2/PublicRepair/Create";
const SESSION_COOKIE = "rr_ntu_repair";

export type RepairSession = {
  cookies: string;
  requestVerificationToken: string;
  capId: string;
};

export type RepairItem = {
  value: string;
  label: string;
};

export function captchaUrl() {
  return "/api/repair/captcha";
}

export async function fetchCreateSession() {
  const response = await fetch(`${NTU_ORIGIN}${CREATE_PATH}`, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "road-report/0.1",
    },
  });
  const html = await response.text();
  const cookies = cookieHeaderFromResponse(response);
  const requestVerificationToken = matchFirst(
    html,
    /name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"/,
  );
  const capId = matchFirst(html, /name="CapId"\s+value="([^"]+)"/);
  const items = parseRepairItems(html);

  if (!response.ok || !requestVerificationToken || !capId || !cookies) {
    throw new Error("無法建立 NTU 報修表單工作階段。");
  }

  return {
    session: { cookies, requestVerificationToken, capId },
    items,
  };
}

export function readRepairSession(request: Request): RepairSession | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const encoded = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (!encoded) {
    return null;
  }

  try {
    const json = fromBase64Url(encoded);
    const payload = JSON.parse(json) as RepairSession;
    if (payload.cookies && payload.requestVerificationToken && payload.capId) {
      return payload;
    }
  } catch {
    return null;
  }

  return null;
}

export function appendRepairSessionCookie(headers: Headers, request: Request, session: RepairSession) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${toBase64Url(JSON.stringify(session))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${15 * 60}${secure}`,
  );
}

export function ntuUrl(path: string) {
  return `${NTU_ORIGIN}${path}`;
}

export function createPath() {
  return `${NTU_ORIGIN}${CREATE_PATH}`;
}

export function mergeCookieHeaders(current: string, response: Response) {
  const next = cookieHeaderFromResponse(response);
  if (!next) {
    return current;
  }

  const jar = new Map<string, string>();

  for (const cookie of [...current.split(";"), ...next.split(";")]) {
    const trimmed = cookie.trim();
    const name = trimmed.split("=")[0];
    if (name) {
      jar.set(name, trimmed);
    }
  }

  return Array.from(jar.values()).join("; ");
}

function cookieHeaderFromResponse(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const raw = headers.getSetCookie?.() ?? response.headers.get("set-cookie") ?? "";
  const values = Array.isArray(raw) ? raw : splitSetCookie(raw);

  if (values.length === 0) {
    return "";
  }

  return values.map((cookie) => cookie.split(";")[0]).join("; ");
}

function splitSetCookie(header: string) {
  return header.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((part) => part.trim());
}

function matchFirst(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1] ?? "";
}

function parseRepairItems(html: string): RepairItem[] {
  const select = html.match(/<select[^>]*name="BrokenItemId"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? "";
  const items: RepairItem[] = [];
  const optionPattern = /<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g;
  let match: RegExpExecArray | null;

  while ((match = optionPattern.exec(select))) {
    if (match[1]) {
      items.push({
        value: decodeHtml(match[1]),
        label: decodeHtml(stripTags(match[2])).trim(),
      });
    }
  }

  return items;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
