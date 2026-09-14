import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds the road report app shell", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>臺大道路狀況回報<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /type="module"/);
  assert.doesNotMatch(html, /_worker|__next|vinext|react-loading-skeleton|codex-preview/);
  assert.doesNotMatch(html, /NTU Road Report/);
});

test("uses native Cloudflare Pages structure", async () => {
  const [app, main, html, packageJson, css, favicon, wrangler, viteConfig, envExample, ntu, flags, session, refresh, submit, tile] = await Promise.all([
    readFile(new URL("../src/RoadReportApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../src/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../functions/_lib/ntu.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/_lib/feature-flags.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/api/repair/session.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/api/repair/captcha/refresh.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/api/repair/submit.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/api/map/tiles/[style]/[z]/[x]/[tile].ts", import.meta.url), "utf8"),
  ]);

  assert.match(main, /createRoot/);
  assert.match(html, /\/src\/main\.tsx/);
  assert.match(app, /from "lucide-react"/);
  assert.match(app, /MapPinned/);
  assert.match(app, /report-sample-road\.jpg/);
  assert.match(app, /const SAMPLE_REPORTS: ReportSummary\[\]/);
  assert.match(app, /function ReportOverview/);
  assert.match(app, /function ReportOverviewMap/);
  assert.match(app, /回報狀況總覽/);
  assert.match(app, /總覽/);
  assert.match(app, /Upload/);
  assert.match(app, /await import\("leaflet"\)/);
  assert.match(app, /\/api\/map\/tiles\/light_all\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(app, /name="camera-photo"/);
  assert.match(app, /capture="environment"/);
  assert.match(app, /name="uploaded-photo"/);
  assert.match(app, /上傳照片/);
  assert.doesNotMatch(app, /照片座標/);
  assert.doesNotMatch(app, /stage-topbar|photo-meta|需要照片|拍攝日期|位置資訊/);
  assert.doesNotMatch(app, /<strong>\{coordinateLabel\}<\/strong>/);
  assert.doesNotMatch(app, /setLocation|formatLocation|報修地點/);
  assert.match(app, /formatCoordinateValue\(coords\)/);
  assert.match(app, /formData\.set\("Latitude", coords\.lat\.toFixed\(6\)\)/);
  assert.match(app, /formData\.set\("Longitude", coords\.lng\.toFixed\(6\)\)/);
  assert.match(app, /function goNext\(\)\s*\{\s*const error = validateRequiredFields\(currentStep\)/);
  assert.match(app, /imageUrl: cacheBustUrl\(payload\.captchaUrl\)/);
  assert.match(app, /setSubmitEnabled\(payload\.submitEnabled === true\)/);
  assert.match(app, /報修送出目前暫停開放，驗證碼仍會正常載入。/);
  assert.match(app, /disabled=\{submitState === "submitting" \|\| captcha\.loading \|\| !submitEnabled\}/);
  assert.match(app, /url\.startsWith\("data:"\)/);
  assert.match(app, /const separator = url\.includes\("\?"\) \? "&" : "\?"/);
  assert.doesNotMatch(app, /captchaUrl\}&v=/);
  assert.match(app, /請先填寫道路狀況描述。/);
  assert.match(app, /請先填寫聯絡電話。/);
  assert.match(app, /aria-label="上一步"/);
  assert.doesNotMatch(app, /basemaps\.cartocdn\.com\/light_all/);
  assert.doesNotMatch(app, /tile\.openstreetmap\.org|tile-grid|buildTiles/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|vinext|eslint-config-next|next"/);
  assert.match(packageJson, /"leaflet"/);
  assert.match(packageJson, /"@types\/leaflet"/);
  assert.match(packageJson, /"lucide-react"/);
  assert.match(packageJson, /"dev:pages": "npm run build && wrangler pages dev dist --env-file=\.env --compatibility-date=2026-05-22"/);
  assert.match(css, /@import "leaflet\/dist\/leaflet\.css"/);
  assert.match(css, /\.leaflet-report-marker/);
  assert.match(css, /\.leaflet-overview-marker/);
  assert.match(css, /\.overview-report-panel/);
  assert.match(css, /height:\s*var\(--app-height,\s*100dvh\)/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto/);
  assert.match(css, /grid-template-columns:\s*58px minmax\(0,\s*1fr\)/);
  assert.match(favicon, /stroke="#17624f"/);
  assert.match(wrangler, /name = "road-report"/);
  assert.match(wrangler, /pages_build_output_dir = "\.\/dist"/);
  assert.match(wrangler, /compatibility_date = "2026-09-14"/);
  assert.match(wrangler, /compatibility_flags = \["nodejs_compat"\]/);
  assert.match(wrangler, /\[secrets\]/);
  assert.match(wrangler, /required = \["CARTO_API_KEY", "REPAIR_SUBMIT_ENABLED"\]/);
  assert.match(viteConfig, /@vitejs\/plugin-react/);
  assert.doesNotMatch(viteConfig, /vinext|@cloudflare\/vite-plugin|sites\(/);
  assert.match(ntu, /fetchCreateSession/);
  assert.match(ntu, /fetchCaptchaImageDataUrl/);
  assert.match(ntu, /data:\$\{contentType\};base64/);
  assert.match(flags, /REPAIR_SUBMIT_ENABLED\?: string/);
  assert.match(flags, /\["1", "true", "yes", "on"\]/);
  assert.match(session, /captchaUrl: captchaImageUrl/);
  assert.match(session, /captchaProxyUrl: captchaUrl\(\)/);
  assert.match(session, /submitEnabled: isRepairSubmitEnabled\(env\)/);
  assert.match(refresh, /captchaUrl: captchaImageUrl/);
  assert.match(refresh, /captchaProxyUrl: captchaUrl\(\)/);
  assert.match(submit, /if \(!isRepairSubmitEnabled\(env\)\)/);
  assert.match(submit, /"Latitude"/);
  assert.match(submit, /"Longitude"/);
  assert.match(submit, /upstream\.set\("Location", coordinatesValue\(incoming\)/);
  assert.doesNotMatch(submit, /withCoordinates|textValue\(incoming, "Location"\)/);
  assert.match(tile, /CARTO_API_KEY\?: string/);
  assert.match(tile, /api_key/);
  assert.match(tile, /x-road-report-config/);
  assert.equal(envExample.trim(), "CARTO_API_KEY=\nREPAIR_SUBMIT_ENABLED=false");
  await assert.rejects(access(new URL("../app/page.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../worker/index.ts", import.meta.url)));
  await assert.rejects(access(new URL("../scripts/prepare-pages-output.mjs", import.meta.url)));
  await assert.rejects(access(new URL("../public/file.svg", import.meta.url)));
  await assert.rejects(access(new URL("../public/globe.svg", import.meta.url)));
  await assert.rejects(access(new URL("../public/window.svg", import.meta.url)));
  await access(new URL("../src/assets/report-sample-road.jpg", import.meta.url));
});

test("prepares Cloudflare Pages static output", async () => {
  const assets = await readdir(new URL("../dist/assets/", import.meta.url));

  await access(new URL("../dist/index.html", import.meta.url));
  await assert.rejects(access(new URL("../dist/_worker.js", import.meta.url)));
  await assert.rejects(access(new URL("../dist/server/index.js", import.meta.url)));
  await assert.rejects(access(new URL("../dist/server/wrangler.json", import.meta.url)));
  await assert.rejects(access(new URL("../.wrangler/deploy/config.json", import.meta.url)));
  assert.ok(assets.some((file) => file.startsWith("index-") && file.endsWith(".js")));
  assert.ok(assets.some((file) => file.startsWith("leaflet-src-")));
});
