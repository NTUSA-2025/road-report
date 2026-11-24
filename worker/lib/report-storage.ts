const CONTACT_NOT_SAVED = "opt-out";
const REPORT_PREFIX = "report:";
const INDEX_KEY = "reports:index";
const PUBLIC_REPORT_LIMIT = 100;

export type ReportKV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
};

export type ReportBucket = {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
};

export type ReportStorageEnv = {
  REPORTS?: ReportKV;
  PHOTOS?: ReportBucket;
};

export type SchoolProgress = {
  status: string;
  unacceptedReason: string;
  returnedReason: string;
};

export type SchoolCase = {
  id: string;
  number: string | null;
  progress: SchoolProgress | null;
  checkedAt: string | null;
};

// Everything the overview needs; kept in the shared index so the page reads one key.
export type ReportSummary = {
  id: string;
  createdAt: string;
  status: string;
  itemId: string;
  reason: string;
  locationNote: string;
  latitude: number;
  longitude: number;
  schoolCaseId: string | null;
  schoolCaseNumber: string | null;
  schoolProgress: SchoolProgress | null;
  schoolCheckedAt: string | null;
};

export type ReportRecord = ReportSummary & {
  imageTaken: { year: number | null; month: number | null; day: number | null };
  photo: { key: string; name: string; contentType: string; size: number };
  saveContactInfo: boolean;
  applicant: { name: string; phone: string; email: string };
};

export function reportStorage(env: ReportStorageEnv) {
  const kv = env.REPORTS;
  const bucket = env.PHOTOS;

  if (!kv || !bucket) {
    throw new Error("Missing report storage binding");
  }

  return { kv, bucket };
}

export type ReportStorage = ReturnType<typeof reportStorage>;

export function photoKey(id: string) {
  return `reports/${id}/photo`;
}

export async function listPublicReports(kv: ReportKV) {
  const reports = await readIndex(kv);
  return { total: reports.length, reports: reports.slice(0, PUBLIC_REPORT_LIMIT) };
}

export async function readIndex(kv: ReportKV) {
  const value = await kv.get(INDEX_KEY);
  const parsed = value ? JSON.parse(value) as { reports?: unknown } : null;
  return Array.isArray(parsed?.reports) ? parsed.reports.filter(isReportSummary) : [];
}

export async function writeIndex(kv: ReportKV, reports: ReportSummary[]) {
  const sorted = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  await kv.put(INDEX_KEY, JSON.stringify({ reports: sorted }));
}

export async function readReport(kv: ReportKV, id: string) {
  const value = await kv.get(`${REPORT_PREFIX}${id}`);
  const parsed: unknown = value ? JSON.parse(value) : null;
  return isReportRecord(parsed) ? parsed : null;
}

export function writeReport(kv: ReportKV, record: ReportRecord) {
  return kv.put(`${REPORT_PREFIX}${record.id}`, JSON.stringify(record));
}

export async function listReportIds(kv: ReportKV) {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: REPORT_PREFIX, cursor });
    ids.push(...page.keys.map((key) => key.name.slice(REPORT_PREFIX.length)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return ids;
}

export function toSummary(record: ReportRecord): ReportSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    status: record.status,
    itemId: record.itemId,
    reason: record.reason,
    locationNote: record.locationNote,
    latitude: record.latitude,
    longitude: record.longitude,
    schoolCaseId: record.schoolCaseId,
    schoolCaseNumber: record.schoolCaseNumber,
    schoolProgress: record.schoolProgress,
    schoolCheckedAt: record.schoolCheckedAt,
  };
}

export async function saveReport(
  storage: ReportStorage,
  incoming: FormData,
  image: File,
  schoolCase: SchoolCase | null = null,
) {
  const id = crypto.randomUUID();
  const key = photoKey(id);
  const contentType = image.type || "application/octet-stream";
  const saveContactInfo = incoming.get("SaveContactInfo") === "true";
  const contact = (field: string) => saveContactInfo ? textValue(incoming, field) : CONTACT_NOT_SAVED;
  const record: ReportRecord = {
    id,
    createdAt: new Date().toISOString(),
    status: "submitted",
    itemId: textValue(incoming, "BrokenItemId"),
    reason: textValue(incoming, "Reason"),
    locationNote: textValue(incoming, "LocationNote"),
    latitude: Number(textValue(incoming, "Latitude")),
    longitude: Number(textValue(incoming, "Longitude")),
    schoolCaseId: schoolCase?.id ?? null,
    schoolCaseNumber: schoolCase?.number ?? null,
    schoolProgress: schoolCase?.progress ?? null,
    schoolCheckedAt: schoolCase?.checkedAt ?? null,
    imageTaken: {
      year: optionalNumber(incoming, "ImageTakenYear"),
      month: optionalNumber(incoming, "ImageTakenMonth"),
      day: optionalNumber(incoming, "ImageTakenDay"),
    },
    photo: { key, name: image.name, contentType, size: image.size },
    saveContactInfo,
    applicant: {
      name: contact("ApplicantName"),
      phone: contact("ApplicantPhone"),
      email: contact("ApplicantEmail"),
    },
  };

  await storage.bucket.put(key, await image.arrayBuffer(), {
    httpMetadata: { contentType },
  });

  try {
    await writeReport(storage.kv, record);
  } catch (error) {
    await storage.bucket.delete(key).catch((cleanupError) => {
      console.error("Failed to remove orphaned report photo", id, cleanupError);
    });
    throw error;
  }

  // The scheduled sync re-adds any report missing from the index, so a lost write here is recoverable.
  try {
    await writeIndex(storage.kv, [toSummary(record), ...await readIndex(storage.kv)]);
  } catch (error) {
    console.error("Failed to add report to index", id, error);
  }

  return id;
}

function isReportSummary(value: unknown): value is ReportSummary {
  const report = value as Partial<ReportSummary> | null;
  return typeof report?.id === "string" &&
    typeof report.createdAt === "string" &&
    typeof report.locationNote === "string" &&
    typeof report.latitude === "number" &&
    typeof report.longitude === "number";
}

function isReportRecord(value: unknown): value is ReportRecord {
  return isReportSummary(value) && typeof (value as Partial<ReportRecord>).photo?.key === "string";
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value ? Number(value) : null;
}
