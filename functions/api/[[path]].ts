interface ProxyEnv {
  MENUFLOW_API?: { fetch(request: Request): Promise<Response> };
}

// Preserve the browser URL, Origin, cookies, request body and Set-Cookie headers.
// A missing binding must never fall through to the SPA or an external API URL.
export async function onRequest(context: { request: Request; env: ProxyEnv }) {
  try {
    if (!context.env.MENUFLOW_API) throw new Error("Missing service binding");
    return await context.env.MENUFLOW_API.fetch(context.request);
  } catch {
    const requestId = crypto.randomUUID();
    return Response.json(
      {
        code: "SERVICE_UNAVAILABLE",
        message: "Servis şu anda kullanılamıyor.",
        request_id: requestId,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
}
