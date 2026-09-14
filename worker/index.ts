/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  CARTO_API_KEY?: string;
  DB?: D1Database;
  ROAD_REPORT_KV?: KVNamespace;
  ROAD_REPORT_BUCKET?: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const CARTO_TILE_PATH_RE = /^\/api\/map\/tiles\/([a-z0-9_]+)\/(\d+)\/(\d+)\/(\d+)\.png$/;
const CARTO_TILE_STYLES = new Set(["light_all"]);

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const tileMatch = url.pathname.match(CARTO_TILE_PATH_RE);
    if (tileMatch) {
      return fetchCartoTile(tileMatch, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

async function fetchCartoTile(match: RegExpMatchArray, env: Env): Promise<Response> {
  const [, style, z, x, y] = match;

  if (!CARTO_TILE_STYLES.has(style)) {
    return new Response("Unknown CARTO tile style", { status: 404 });
  }

  if (!env.CARTO_API_KEY) {
    return new Response("CARTO_API_KEY is not configured", { status: 503 });
  }

  const subdomains = ["a", "b", "c", "d"];
  const subdomain = subdomains[Number(x) % subdomains.length];
  const tileUrl = new URL(`/${style}/${z}/${x}/${y}.png`, `https://${subdomain}.basemaps.cartocdn.com`);
  tileUrl.searchParams.set("api_key", env.CARTO_API_KEY);

  const upstream = await fetch(tileUrl, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
    },
  });
  const headers = new Headers(upstream.headers);

  headers.set("cache-control", upstream.ok ? "public, max-age=86400, stale-while-revalidate=604800" : "no-store");
  headers.delete("set-cookie");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export default worker;
