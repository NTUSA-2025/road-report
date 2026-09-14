import { access, copyFile, cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const serverDir = new URL("../dist/server/", import.meta.url);
const clientDir = new URL("../dist/client/", import.meta.url);
const deployConfig = new URL("../.wrangler/deploy/config.json", import.meta.url);

async function assertExists(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} does not exist. Run the vinext build first.`);
  }
}

await assertExists(serverDir, "dist/server");
await assertExists(clientDir, "dist/client");

await copyFile(new URL("index.js", serverDir), new URL("_worker.js", clientDir));

for (const entry of await readdir(serverDir, { withFileTypes: true })) {
  if (entry.name === "index.js" || entry.name === "wrangler.json" || entry.name === ".vite") {
    continue;
  }

  const from = join(serverDir.pathname, entry.name);
  const to = join(clientDir.pathname, entry.name);

  if (entry.isDirectory()) {
    await mkdir(to, { recursive: true });
    await cp(from, to, { recursive: true, force: true });
  } else {
    await rm(to, { recursive: true, force: true });
    await mkdir(new URL("./", clientDir), { recursive: true });
    await copyFile(from, to);
  }
}

// Cloudflare Pages validates the Wrangler config again after the build. The
// Cloudflare Vite plugin writes a deploy redirect to dist/server/wrangler.json,
// which is a Worker config and is rejected by Pages projects. The Pages-ready
// artifact is dist/client/_worker.js, so remove the redirect and generated file.
await rm(new URL("wrangler.json", serverDir), { force: true });
await rm(deployConfig, { force: true });
