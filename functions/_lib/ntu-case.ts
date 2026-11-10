const DETAILS_PATH = "/repairservice2/PublicRepair/Details";
const DETAILS_URL = `https://my.ntu.edu.tw${DETAILS_PATH}`;

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

export async function fetchPublicCaseNumber(caseId: string) {
  const url = new URL(DETAILS_URL);
  url.searchParams.set("caseId", caseId);
  const response = await fetch(url, { headers: { accept: "text/html" } });
  if (!response.ok) {
    throw new Error(`NTU case details returned ${response.status}`);
  }

  const html = await response.text();
  return html.match(/<title>\s*([A-Z]{2}\d{6,})\s*-/i)?.[1] ?? null;
}
