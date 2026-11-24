import { jsonResponse } from "../lib/http";
import { photoKey } from "../lib/report-storage";
import type { RouteHandler } from "../lib/env";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/bmp", "image/webp", "image/gif"]);

export const getReportPhoto: RouteHandler = async (request, env, params) => {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.id)) {
    return jsonResponse({ error: "找不到照片。" }, { status: 404 });
  }

  if (!env.PHOTOS) {
    return jsonResponse({ error: "照片暫時無法讀取。" }, { status: 503 });
  }

  try {
    const object = await env.PHOTOS.get(photoKey(params.id));
    const contentType = object?.httpMetadata?.contentType?.toLowerCase();
    if (!object || !contentType || !IMAGE_TYPES.has(contentType)) {
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
};
