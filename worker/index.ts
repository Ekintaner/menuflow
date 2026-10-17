import { guest } from "./guest";
import { platform } from "./platform";
import { management, ApiError } from "./management";
export interface Env {
  DEPLOYMENT_ENV?: string;
  ORDERING_DISABLED?: string;
  PLATFORM_ADMIN_USER_ID?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ORDER_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  AUTH_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  MENU_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
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
export async function fetchRequest(
  request: Request,
  env: Env = {},
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (
    !path.startsWith("/api/v1/admin/") &&
    !path.startsWith("/api/v1/auth/") &&
    !path.startsWith("/api/v1/platform/") &&
    path !== "/api/v1/menu" &&
    path !== "/api/v1/guest-sessions" &&
    !path.startsWith("/api/v1/orders")
  )
    return handleRequest(request);
  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    // Cloud deployments must explicitly opt in after all safety bindings exist.
    if (env.DEPLOYMENT_ENV !== undefined) {
      if (
        !["staging", "pilot"].includes(env.DEPLOYMENT_ENV) ||
        !env.SUPABASE_URL?.startsWith("https://") ||
        !env.SUPABASE_PUBLISHABLE_KEY ||
        !env.SUPABASE_SERVICE_ROLE_KEY ||
        !env.AUTH_LIMIT ||
        !env.MENU_LIMIT ||
        !env.ORDER_LIMIT ||
        !["true", "false"].includes(env.ORDERING_DISABLED ?? "")
      )
        throw new ApiError(
          503,
          "NOT_CONFIGURED",
          "Servis henüz yapılandırılmadı.",
        );
    }
    if (
      env.ORDERING_DISABLED === "true" &&
      request.method === "POST" &&
      path === "/api/v1/orders"
    )
      throw new ApiError(
        503,
        "ORDERING_PAUSED",
        "Yeni sipariş alımı geçici olarak durduruldu. İşletmeyle görüşün.",
      );
    response = await (path.startsWith("/api/v1/platform/")
      ? platform(request, env)
      : path === "/api/v1/guest-sessions" ||
          path.startsWith("/api/v1/orders") ||
          (path === "/api/v1/menu" &&
            request.method === "GET" &&
            request.headers.get("cookie")?.includes("mf_guest="))
        ? guest(request, env)
        : management(request, env));
  } catch (e) {
    const known = e instanceof ApiError;
    response = Response.json(
      {
        code: known ? e.code : "SERVICE_UNAVAILABLE",
        message: known ? e.message : "Servis şu anda kullanılamıyor.",
        request_id: requestId,
      },
      { status: known ? e.status : 503 },
    );
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Request-Id", requestId);
  if (response.status === 429) response.headers.set("Retry-After", "60");
  return response;
}
export default { fetch: fetchRequest };
