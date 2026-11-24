export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function methodNotAllowed(allowed: string[]) {
  return jsonResponse(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: {
        allow: allowed.join(", "),
      },
    },
  );
}
