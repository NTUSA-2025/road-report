const DETAILS_PATH = "/repairservice2/PublicRepair/Details";
const DETAILS_URL = `https://my.ntu.edu.tw${DETAILS_PATH}`;

export type PublicRepairCase = {
  caseId: string;
  caseNumber: string;
  status: string;
  submittedAt: string;
  location: string;
  item: string;
  reason: string;
  unacceptedReason: string;
  returnedReason: string;
  detailUrl: string;
};

export function caseIdFromRedirect(location: string) {
  try {
    const url = new URL(location, DETAILS_URL);
    const caseId = url.searchParams.get("caseId");
    return url.origin === "https://my.ntu.edu.tw" &&
      url.pathname === DETAILS_PATH &&
      caseId && /^[1-9]\d*$/.test(caseId)
      ? caseId
      : null;
  } catch {
    return null;
  }
}

export function parsePublicCase(caseId: string, html: string): PublicRepairCase {
  const caseNumber = html.match(/<title>\s*([A-Z]{2}\d{6,})\s*-/i)?.[1] ?? "";
  const headingEnd = html.indexOf("</h2>");
  const headingArea = headingEnd < 0 ? "" : html.slice(headingEnd, headingEnd + 800);
  const badges = Array.from(
    headingArea.matchAll(/<div\b[^>]*class="[^"]*\bd-inline-block\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi),
    (match) => htmlText(match[1]),
  );
  const status = badges.filter((badge) => badge !== "公設").at(-1) ?? "";
  if (!caseNumber || !status) {
    throw new Error("NTU case details did not contain a case number and status");
  }

  return {
    caseId,
    caseNumber,
    status,
    submittedAt: detailField(html, "申請日期"),
    location: detailField(html, "報修地點"),
    item: detailField(html, "申報項目"),
    reason: detailField(html, "申報事由"),
    unacceptedReason: detailSection(html, "不受理說明"),
    returnedReason: detailSection(html, "退件說明"),
    detailUrl: detailUrl(caseId),
  };
}

export async function fetchPublicCase(caseId: string) {
  if (!/^[1-9]\d*$/.test(caseId)) {
    throw new Error("Invalid NTU case id");
  }
  const url = new URL(DETAILS_URL);
  url.searchParams.set("caseId", caseId);
  const response = await fetch(url, { headers: { accept: "text/html" } });
  if (!response.ok) {
    throw new Error(`NTU case details returned ${response.status}`);
  }
  return parsePublicCase(caseId, await response.text());
}

function detailUrl(caseId: string) {
  const url = new URL(DETAILS_URL);
  url.searchParams.set("caseId", caseId);
  return url.toString();
}

function detailField(html: string, label: string) {
  const pattern = new RegExp(`<label\\b[^>]*>\\s*${label}\\s*<\\/label>\\s*<div\\b[^>]*>([\\s\\S]*?)<\\/div>`, "i");
  return htmlText(html.match(pattern)?.[1] ?? "");
}

function detailSection(html: string, label: string) {
  const pattern = new RegExp(`<h3\\b[^>]*>\\s*${label}\\s*<\\/h3>([\\s\\S]*?)<\\/div>`, "i");
  return htmlText(html.match(pattern)?.[1] ?? "");
}

function htmlText(value: string) {
  return value.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}
