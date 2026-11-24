import { getMapTile } from "./api/map-tiles";
import { getCaptchaImage } from "./api/repair-captcha";
import { refreshCaptcha } from "./api/repair-captcha-refresh";
import { createRepairSession } from "./api/repair-session";
import { submitRepair } from "./api/repair-submit";
import { getReportPhoto } from "./api/report-photo";
import { listReports } from "./api/reports";
import type { Env, RouteHandler } from "./lib/env";
import { jsonResponse, methodNotAllowed } from "./lib/http";
import { syncReports } from "./sync";

type Route = {
  pattern: RegExp;
  methods: Record<string, RouteHandler>;
};

const ROUTES: Route[] = [
  { pattern: /^\/api\/repair\/session$/, methods: { POST: createRepairSession } },
  { pattern: /^\/api\/repair\/captcha$/, methods: { GET: getCaptchaImage } },
  { pattern: /^\/api\/repair\/captcha\/refresh$/, methods: { POST: refreshCaptcha } },
  { pattern: /^\/api\/repair\/submit$/, methods: { POST: submitRepair } },
  { pattern: /^\/api\/reports$/, methods: { GET: listReports } },
  { pattern: /^\/api\/reports\/(?<id>[^/]+)\/photo$/, methods: { GET: getReportPhoto } },
  {
    pattern: /^\/api\/map\/tiles\/(?<style>[^/]+)\/(?<z>[^/]+)\/(?<x>[^/]+)\/(?<tile>[^/]+)$/,
    methods: { GET: getMapTile },
  },
];

type ScheduledContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url);

    if (!pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    for (const route of ROUTES) {
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const handler = route.methods[request.method];
      if (!handler) return methodNotAllowed(Object.keys(route.methods));

      return handler(request, env, match.groups ?? {});
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  },

  async scheduled(_controller: unknown, env: Env, ctx: ScheduledContext) {
    if (!env.REPORTS) {
      console.error("Skipping report sync: REPORTS binding is missing");
      return;
    }

    ctx.waitUntil(
      syncReports(env.REPORTS).then(
        (result) => console.log("Report sync finished", JSON.stringify(result)),
        (error) => console.error("Report sync failed", error),
      ),
    );
  },
};
