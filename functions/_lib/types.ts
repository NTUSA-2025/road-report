export type PagesContext<Env = unknown, Params = Record<string, string>> = {
  request: Request;
  env: Env;
  params: Params;
  waitUntil(promise: Promise<unknown>): void;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  data: unknown;
};
