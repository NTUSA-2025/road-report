import type { SubmissionFeatureEnv } from "./feature-flags";
import type { ReportStorageEnv } from "./report-storage";

export type Env = SubmissionFeatureEnv & ReportStorageEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CARTO_API_KEY?: string;
};

export type RouteHandler = (
  request: Request,
  env: Env,
  params: Record<string, string>,
) => Response | Promise<Response>;
