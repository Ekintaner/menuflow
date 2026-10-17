import { createClient } from "@supabase/supabase-js";
import {
  ApiError,
  body,
  cookie,
  hash,
  randomToken,
  sessionCookie,
  uuid,
} from "./management";
import type { Env } from "./index";
export async function guest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname;
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin)
    throw new ApiError(403, "ORIGIN_DENIED", "İstek kaynağı doğrulanamadı.");
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError(503, "NOT_CONFIGURED", "Servis henüz yapılandırılmadı.");
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args);
    if (error) {
      const codes: Record<string, [number, string]> = {
        SESSION_REQUIRED: [401, "Oturum sona erdi. QR kodunu tekrar okutun."],
        IDEMPOTENCY_CONFLICT: [
          409,
          "Bu gönderim anahtarı farklı bir sepet için kullanılmış.",
        ],
        MENU_CHANGED: [
          409,
          "Menü değişti. Güncel fiyatları kontrol edip tekrar onaylayın.",
        ],
        ORDERING_CLOSED: [409, "İşletme şu anda sipariş almıyor."],
        PRODUCT_UNAVAILABLE: [422, "Sepetteki ürün artık mevcut değil."],
        INVALID_INPUT: [422, "Sepeti ve adetleri kontrol edin."],
        RATE_LIMIT: [429, "Bir dakika sonra tekrar deneyin."],
      };
      const code = error.message,
        mapped = codes[code];
      throw new ApiError(
        mapped?.[0] ?? 503,
        mapped ? code : "SERVICE_UNAVAILABLE",
        mapped?.[1] ??
          "Servis şu anda kullanılamıyor. Aynı gönderimi tekrar deneyin.",
      );
    }
    return data;
  }
  if (path === "/api/v1/guest-sessions" && request.method === "POST") {
    const b = await body(request);
    if (typeof b.token !== "string" || !/^[a-f0-9]{64}$/.test(b.token))
      throw new ApiError(401, "QR_REQUIRED", "Masadaki QR kodunu okutun.");
    if (env.MENU_LIMIT)
      for (const key of [
        `ip:${request.headers.get("cf-connecting-ip") ?? "local"}`,
        `qr:${await hash(b.token)}`,
      ])
        if (!(await env.MENU_LIMIT.limit({ key })).success)
          throw new ApiError(
            429,
            "RATE_LIMIT",
            "Bir dakika sonra tekrar deneyin.",
          );
    const token = randomToken();
    if (
      !(await rpc("open_guest_session", {
        qr_hash: await hash(b.token),
        guest_hash: await hash(token),
      }))
    )
      throw new ApiError(
        404,
        "QR_INVALID",
        "QR geçersiz veya masa kapalı. Yeni QR kodunu okutun.",
      );
    return Response.json(
      { created: true },
      {
        status: 201,
        headers: {
          "Set-Cookie": sessionCookie(request, "mf_guest", token, 14400),
        },
      },
    );
  }
  const token = cookie(request, "mf_guest");
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, "SESSION_REQUIRED", "Masadaki QR kodunu okutun.");
  const guest_hash = await hash(token);
  if (path === "/api/v1/menu" && request.method === "GET") {
    const menu = await rpc("guest_menu", { guest_hash });
    if (!menu)
      throw new ApiError(
        401,
        "SESSION_REQUIRED",
        "Oturum sona erdi. QR kodunu tekrar okutun.",
      );
    for (const p of menu.products) {
      if (p.image_path)
        p.image_url =
          (
            await db.storage
              .from("menu-images")
              .createSignedUrl(p.image_path, 300)
          ).data?.signedUrl ?? null;
      delete p.image_path;
    }
    return Response.json(menu);
  }
  if (path === "/api/v1/orders" && request.method === "POST") {
    const b = await body(request),
      key = request.headers.get("idempotency-key");
    if (
      !key ||
      !/^[a-zA-Z0-9_-]{1,200}$/.test(key) ||
      !Array.isArray(b.items) ||
      b.items.length < 1 ||
      b.items.length > 30 ||
      !Number.isSafeInteger(b.version) ||
      (typeof b.note !== "undefined" &&
        (typeof b.note !== "string" || b.note.length > 500)) ||
      Object.keys(b).some(
        (k) => !["items", "note", "version", "session_id"].includes(k),
      )
    )
      throw new ApiError(
        422,
        "INVALID_INPUT",
        "Geçerli sepet, menü sürümü ve gönderim anahtarı gerekli.",
      );
    const items = b.items
      .map((v: Record<string, unknown>) => {
        if (
          !v ||
          Object.keys(v).some((k) => !["product_id", "quantity"].includes(k)) ||
          !Number.isInteger(v.quantity) ||
          (v.quantity as number) < 1 ||
          (v.quantity as number) > 20
        )
          throw new ApiError(
            422,
            "INVALID_INPUT",
            "Adet 1–20 arasında olmalı.",
          );
        return { product_id: uuid(v.product_id), quantity: v.quantity };
      })
      .sort((a, b) => a.product_id.localeCompare(b.product_id));
    if (new Set(items.map((i) => i.product_id)).size !== items.length)
      throw new ApiError(
        422,
        "INVALID_INPUT",
        "Aynı ürünü tek satırda gönderin.",
      );
    if (env.ORDER_LIMIT)
      for (const key of [
        `ip:${request.headers.get("cf-connecting-ip") ?? "local"}`,
        `session:${guest_hash}`,
      ])
        if (!(await env.ORDER_LIMIT.limit({ key })).success)
          throw new ApiError(
            429,
            "RATE_LIMIT",
            "Bir dakika sonra tekrar deneyin.",
          );
    const result = await rpc("create_guest_order", {
      guest_hash,
      idem_key: key,
      payload: {
        items,
        note: b.note ?? "",
        version: b.version,
        session_id: uuid(b.session_id),
      },
    });
    return Response.json(result.order, { status: result.replayed ? 200 : 201 });
  }
  const match = path.match(/^\/api\/v1\/orders\/([^/]+)$/);
  if (match && request.method === "GET") {
    const order = await rpc("guest_order", {
      guest_hash,
      target_order: uuid(match[1]),
    });
    if (!order) throw new ApiError(404, "NOT_FOUND", "Sipariş bulunamadı.");
    return Response.json(order);
  }
  throw new ApiError(404, "NOT_FOUND", "Uç bulunamadı.");
}
