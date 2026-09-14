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
    return jsonResponse({ error: "CARTO_API_KEY is not configured" }, { status: 503 });
  }

  const y = tile.replace(/\.png$/, "");
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
