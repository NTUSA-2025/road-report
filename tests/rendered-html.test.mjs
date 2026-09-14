import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the road report app shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>臺大道路狀況回報<\/title>/i);
  assert.match(html, /臺大道路狀況回報/);
  assert.match(html, /道路狀況回報/);
  assert.match(html, /先留下現場畫面/);
  assert.match(html, /下一步/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/);
  assert.doesNotMatch(html, /NTU Road Report/);
});

test("keeps starter preview removed", async () => {
  const [page, app, layout, packageJson, css, favicon, wrangler] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RoadReportApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.toml", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.match(app, /from "lucide-react"/);
  assert.match(app, /await import\("leaflet"\)/);
  assert.match(app, /basemaps\.cartocdn\.com\/light_all/);
  assert.doesNotMatch(app, /tile\.openstreetmap\.org|tile-grid|buildTiles/);
  assert.doesNotMatch(layout, /Starter Project|next\/font\/google/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /"leaflet"/);
  assert.match(packageJson, /"@types\/leaflet"/);
  assert.match(packageJson, /"lucide-react"/);
  assert.match(css, /@import "leaflet\/dist\/leaflet\.css"/);
  assert.match(css, /\.leaflet-report-marker/);
  assert.match(css, /height:\s*var\(--app-height,\s*100dvh\)/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto/);
  assert.match(favicon, /stroke="#17624f"/);
  assert.match(wrangler, /name = "road-report"/);
  assert.match(wrangler, /pages_build_output_dir = "\.\/dist\/client"/);
  assert.match(wrangler, /compatibility_date = "2026-09-14"/);
  assert.match(wrangler, /compatibility_flags = \["nodejs_compat"\]/);
  await assert.rejects(access(new URL("../public/file.svg", import.meta.url)));
  await assert.rejects(access(new URL("../public/globe.svg", import.meta.url)));
  await assert.rejects(access(new URL("../public/window.svg", import.meta.url)));
});

test("prepares Cloudflare Pages advanced mode output", async () => {
  const assets = await readdir(new URL("../dist/client/assets/", import.meta.url));

  await access(new URL("../dist/client/_worker.js", import.meta.url));
  await access(new URL("../dist/client/ssr/index.js", import.meta.url));
  assert.ok(assets.some((file) => file.startsWith("RoadReportApp-")));
  assert.ok(assets.some((file) => file.startsWith("leaflet-src-")));
});
