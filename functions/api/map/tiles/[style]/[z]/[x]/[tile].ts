import { jsonResponse } from "../../../../../../_lib/http";
import type { PagesContext } from "../../../../../../_lib/types";

type Env = {
  CARTO_API_KEY?: string;
};

const CARTO_TILE_STYLES = new Set(["light_all"]);

export async function onRequestGet({
  env,
  params,
}: PagesContext<Env, { style: string; z: string; x: string; tile: string }>) {
  const { style, z, x, tile } = params;

  if (!CARTO_TILE_STYLES.has(style) || !/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+\.png$/.test(tile)) {
    return jsonResponse({ error: "Unknown CARTO tile" }, { status: 404 });
  }

  if (!env.CARTO_API_KEY) {
    return jsonResponse(
      {
        error:
          "CARTO_API_KEY is not configured. Set the secret for this Cloudflare Pages environment and redeploy.",
      },
      {
        status: 503,
        headers: {
          "x-road-report-config": "missing-carto-api-key",
        },
      },
    );
  }

  const y = tile.replace(/\.png$/, "");
  const subdomains = ["a", "b", "c", "d"];
  const subdomain = subdomains[Number(x) % subdomains.length];
  const tileUrl = new URL(`/rastertiles/${style}/${z}/${x}/${y}.png`, `https://${subdomain}.basemaps.cartocdn.com`);
  tileUrl.searchParams.set("key", env.CARTO_API_KEY);

  let upstream: Response;

  try {
    upstream = await fetch(tileUrl, {
      headers: {
        accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Unable to reach CARTO tile service.",
        detail: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
        headers: diagnosticHeaders({
          path: tileUrl.pathname,
          style,
          status: "fetch-error",
          upstreamHost: tileUrl.host,
        }),
      },
    );
  }

  const headers = new Headers(upstream.headers);

  headers.set("cache-control", upstream.ok ? "public, max-age=86400, stale-while-revalidate=604800" : "no-store");
  setDiagnosticHeaders(headers, {
    path: tileUrl.pathname,
    style,
    status: String(upstream.status),
    upstreamHost: tileUrl.host,
  });
  headers.delete("set-cookie");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function diagnosticHeaders({
  status,
  path,
  style,
  upstreamHost,
}: {
  status: string;
  path: string;
  style: string;
  upstreamHost: string;
}) {
  const headers = new Headers();

  setDiagnosticHeaders(headers, {
    path,
    status,
    style,
    upstreamHost,
  });

  return headers;
}

function setDiagnosticHeaders(
  headers: Headers,
  {
    status,
    path,
    style,
    upstreamHost,
  }: {
    status: string;
    path: string;
    style: string;
    upstreamHost: string;
  },
) {
  headers.set("x-road-report-config", "carto-api-key-present");
  headers.set("x-road-report-upstream-host", upstreamHost);
  headers.set("x-road-report-upstream-path", path);
  headers.set("x-road-report-upstream-status", status);
  headers.set("x-road-report-upstream-style", style);
}
