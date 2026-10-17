export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}
export function handleRequest(request: Request): Response {
  const path = new URL(request.url).pathname;
  const requestId = crypto.randomUUID();
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  };
  if (path === "/api/v1/health" && request.method === "GET")
    return Response.json(
      { status: "ok", service: "menuflow-api" },
      { headers },
    );
  return Response.json(
    {
      code: "NOT_FOUND",
      message: "Bu uç henüz kullanıma açık değil.",
      request_id: requestId,
    },
    { status: 404, headers },
  );
}
export default { fetch: handleRequest };
