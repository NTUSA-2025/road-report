import { jsonResponse, methodNotAllowed } from "../../../_lib/http";
import { findReportPhoto, type ReportStorageEnv } from "../../../_lib/report-storage";
import type { PagesContext } from "../../../_lib/types";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/bmp", "image/webp", "image/gif"]);

export async function onRequestGet({ env, params }: PagesContext<ReportStorageEnv, { id: string }>) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.id)) {
    return jsonResponse({ error: "找不到照片。" }, { status: 404 });
  }

  const database = env["road-report-db"];
  const bucket = env["road-report-r2"];

  if (!database || !bucket) {
    return jsonResponse({ error: "照片暫時無法讀取。" }, { status: 503 });
  }

  try {
    const record = await findReportPhoto(database, params.id);
    const contentType = record?.photo_content_type.toLowerCase();
    if (!record || !contentType || !IMAGE_TYPES.has(contentType)) {
      return jsonResponse({ error: "找不到照片。" }, { status: 404 });
    }

    const object = await bucket.get(record.photo_key);
    if (!object) {
      return jsonResponse({ error: "找不到照片。" }, { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to load report photo", params.id, error);
    return jsonResponse({ error: "照片暫時無法讀取。" }, { status: 503 });
  }
}

export function onRequestPost() {
  return methodNotAllowed(["GET"]);
}
