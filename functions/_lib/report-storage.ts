const CONTACT_NOT_SAVED = "opt-out";

type D1Statement = {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
};

export type ReportDatabase = {
  prepare(query: string): D1Statement;
};

export type ReportBucket = {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream } | null>;
  delete(key: string): Promise<void>;
};

type ReportIndex = {
  put(key: string, value: string): Promise<void>;
};

export type ReportStorageEnv = {
  "road-report-db"?: ReportDatabase;
  "road-report-r2"?: ReportBucket;
  ROAD_REPORT_KV?: ReportIndex;
};

export function reportStorage(env: ReportStorageEnv) {
  const database = env["road-report-db"];
  const bucket = env["road-report-r2"];
  const index = env.ROAD_REPORT_KV;

  if (!database || !bucket || !index) {
    throw new Error("Missing report storage binding");
  }

  return { database, bucket, index };
}

export async function checkReportSchema(database: ReportDatabase) {
  await database.prepare("SELECT id FROM reports LIMIT 1").first();
}

export type PublicReportRow = {
  id: string;
  created_at: string;
  status: string;
  broken_item_id: string;
  reason: string;
  location_note: string;
  latitude: number;
  longitude: number;
};

export async function listPublicReports(database: ReportDatabase) {
  const [count, rows] = await Promise.all([
    database.prepare("SELECT COUNT(*) AS total FROM reports").first<{ total: number }>(),
    database.prepare(`
      SELECT id, created_at, status, broken_item_id, reason, location_note, latitude, longitude
      FROM reports ORDER BY created_at DESC, id DESC LIMIT 100
    `).all<PublicReportRow>(),
  ]);

  return { total: count?.total ?? 0, rows: rows.results };
}

export function findReportPhoto(database: ReportDatabase, id: string) {
  return database.prepare(
    "SELECT photo_key, photo_content_type FROM reports WHERE id = ?",
  ).bind(id).first<{ photo_key: string; photo_content_type: string }>();
}

export async function saveReport(
  storage: ReturnType<typeof reportStorage>,
  incoming: FormData,
  image: File,
) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const photoKey = `reports/${id}/photo`;
  const contentType = image.type || "application/octet-stream";
  const saveContactInfo = incoming.get("SaveContactInfo") === "true";
  const contact = (key: string) => saveContactInfo ? textValue(incoming, key) : CONTACT_NOT_SAVED;

  await storage.bucket.put(photoKey, await image.arrayBuffer(), {
    httpMetadata: { contentType },
  });

  try {
    const result = await storage.database.prepare(`
      INSERT INTO reports (
        id, created_at, broken_item_id, reason, location_note, latitude, longitude,
        image_taken_year, image_taken_month, image_taken_day,
        photo_key, photo_name, photo_content_type, photo_size, save_contact_info,
        applicant_name, applicant_phone, applicant_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      createdAt,
      textValue(incoming, "BrokenItemId"),
      textValue(incoming, "Reason"),
      textValue(incoming, "LocationNote"),
      Number(textValue(incoming, "Latitude")),
      Number(textValue(incoming, "Longitude")),
      optionalNumber(incoming, "ImageTakenYear"),
      optionalNumber(incoming, "ImageTakenMonth"),
      optionalNumber(incoming, "ImageTakenDay"),
      photoKey,
      image.name,
      contentType,
      image.size,
      saveContactInfo ? 1 : 0,
      contact("ApplicantName"),
      contact("ApplicantPhone"),
      contact("ApplicantEmail"),
    ).run();

    if (!result.success) {
      throw new Error("D1 report insert failed");
    }
  } catch (error) {
    await storage.bucket.delete(photoKey).catch((cleanupError) => {
      console.error("Failed to remove orphaned report photo", id, cleanupError);
    });
    throw error;
  }

  try {
    await storage.index.put(`report:${id}`, JSON.stringify({ id, createdAt, status: "submitted" }));
  } catch (error) {
    console.error("Failed to index saved report", id, error);
  }

  return id;
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value ? Number(value) : null;
}
