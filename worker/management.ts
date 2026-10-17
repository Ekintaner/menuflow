import { createClient } from "@supabase/supabase-js";
import { createUserDatabase } from "./supabase";
import type { Env } from "./index";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string): never => {
  throw new ApiError(status, code, message);
};
export const uuid = (v: unknown): string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v
    : fail(422, "INVALID_ID", "Geçersiz kayıt kimliği.");
export function text(v: unknown, max: number, empty = false): string {
  if (typeof v !== "string" || (!empty && !v.trim()) || v.length > max)
    fail(422, "INVALID_INPUT", "Alan uzunluğunu kontrol edin.");
  return (v as string).trim();
}
export function cookie(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}
export function sessionCookie(
  request: Request,
  name: string,
  value: string,
  age: number,
) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function database(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
    fail(503, "NOT_CONFIGURED", "Servis henüz yapılandırılmadı.");
  return createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
async function limitedBytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    fail(413, "TOO_LARGE", "İstek çok büyük.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      fail(413, "TOO_LARGE", "İstek çok büyük.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    fail(400, "INVALID_JSON", "JSON bekleniyor.");
  const raw = new TextDecoder().decode(await limitedBytes(request, 16000));
  if (raw.length > 16000) fail(413, "TOO_LARGE", "İstek çok büyük.");
  try {
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data !== "object") throw Error();
    return data as Record<string, unknown>;
  } catch {
    return fail(400, "INVALID_JSON", "Geçersiz JSON.");
  }
}
function checked<T>(result: { data: T; error: unknown }): T {
  const code =
    result.error && typeof result.error === "object" && "code" in result.error
      ? result.error.code
      : undefined;
  if (code === "PGRST116") fail(404, "NOT_FOUND", "Kayıt bulunamadı.");
  if (code === "23505") fail(409, "CONFLICT", "Bu kayıt zaten var.");
  if (code === "42501") fail(403, "ACCESS_DENIED", "Bu işleme erişiminiz yok.");
  if (result.error)
    fail(
      422,
      "OPERATION_FAILED",
      "İşlem tamamlanamadı. Alanları ve erişiminizi kontrol edin.",
    );
  return result.data;
}
export async function management(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  const json = (data: unknown, status = 200, headers = {}) =>
    Response.json(data, { status, headers });
  if (
    !["GET", "HEAD"].includes(method) &&
    request.headers.get("origin") !== url.origin
  )
    fail(403, "ORIGIN_DENIED", "İstek kaynağı doğrulanamadı.");
  if (path === "/api/v1/auth/login" && method === "POST") {
    const b = await body(request),
      db = database(env);
    if (env.AUTH_LIMIT) {
      for (const key of [
        `ip:${request.headers.get("cf-connecting-ip") ?? "local"}`,
        `account:${await hash(text(b.email, 254).toLowerCase())}`,
      ]) {
        if (!(await env.AUTH_LIMIT.limit({ key })).success)
          fail(429, "RATE_LIMIT", "Bir dakika sonra tekrar deneyin.");
      }
    }
    const { data, error } = await db.auth.signInWithPassword({
      email: text(b.email, 254),
      password:
        typeof b.password === "string" &&
        b.password.length > 0 &&
        b.password.length <= 1024
          ? b.password
          : fail(422, "INVALID_INPUT", "Parola gerekli."),
    });
    if (error || !data.session)
      fail(401, "LOGIN_FAILED", "E-posta veya parola doğrulanamadı.");
    return json({ authenticated: true }, 200, {
      "Set-Cookie": sessionCookie(
        request,
        "mf_admin",
        data.session!.access_token,
        Math.min(data.session!.expires_in, 3600),
      ),
    });
  }
  if (path === "/api/v1/auth/logout" && method === "POST") {
    const token = cookie(request, "mf_admin");
    if (token)
      await createUserDatabase(env, token).auth.admin.signOut(token, "local");
    return json({ authenticated: false }, 200, {
      "Set-Cookie": sessionCookie(request, "mf_admin", "", 0),
    });
  }
  // Legacy CODEX-003 read-only menu capability; ordering always requires a separate guest session.
  if (path === "/api/v1/menu" && (method === "GET" || method === "POST")) {
    const token =
      method === "POST"
        ? (await body(request)).token
        : cookie(request, "mf_menu");
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      fail(401, "QR_REQUIRED", "Masadaki QR kodunu okutun.");
    if (
      env.MENU_LIMIT &&
      !(
        await env.MENU_LIMIT.limit({ key: `qr:${await hash(token as string)}` })
      ).success
    )
      fail(429, "RATE_LIMIT", "Bir dakika sonra tekrar deneyin.");
    database(env);
    if (!env.SUPABASE_SERVICE_ROLE_KEY)
      fail(503, "NOT_CONFIGURED", "Menü servisi henüz yapılandırılmadı.");
    const db = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.rpc("read_qr_menu", {
      supplied_hash: await hash(token as string),
    });
    if (error) fail(503, "MENU_UNAVAILABLE", "Menü şu anda yüklenemiyor.");
    if (!data)
      fail(
        404,
        "QR_INVALID",
        "QR geçersiz veya masa kapalı. Yeni QR kodunu okutun.",
      );
    for (const product of data.products) {
      if (product.image_path) {
        const signed = await db.storage
          .from("menu-images")
          .createSignedUrl(product.image_path, 300);
        product.image_url = signed.data?.signedUrl ?? null;
      }
      delete product.image_path;
    }
    return json(
      data,
      200,
      method === "POST"
        ? {
            "Set-Cookie": sessionCookie(
              request,
              "mf_menu",
              token as string,
              14400,
            ),
          }
        : {},
    );
  }
  const token = cookie(request, "mf_admin");
  if (!token) fail(401, "AUTH_REQUIRED", "Yönetici girişi gerekli.");
  const db = createUserDatabase(env, token);
  const { data: identity, error } = await db.auth.getUser(token);
  if (error || !identity.user)
    fail(401, "AUTH_REQUIRED", "Oturum sona erdi. Tekrar giriş yapın.");
  if (path === "/api/v1/admin/memberships" && method === "GET") {
    return json(
      checked(
        await db
          .from("memberships")
          .select("tenant_id,role,tenants(id,name,currency)")
          .eq("user_id", identity.user!.id)
          .eq("active", true),
      ),
    );
  }
  const tenant = uuid(url.searchParams.get("tenant"));
  const membership = checked(
    await db
      .from("memberships")
      .select("role")
      .eq("tenant_id", tenant)
      .eq("user_id", identity.user!.id)
      .eq("active", true)
      .maybeSingle(),
  );
  if (!membership)
    fail(403, "MEMBERSHIP_REQUIRED", "Aktif işletme üyeliği gerekli.");
  if (method !== "GET" && membership!.role !== "owner")
    fail(
      403,
      "OWNER_REQUIRED",
      "Bu işlem için işletme sahibi yetkisi gerekli.",
    );
  if (path === "/api/v1/admin/publish" && method === "POST") {
    const b = await body(request);
    if (typeof b.published !== "boolean")
      fail(422, "INVALID_INPUT", "Yayın durumu gerekli.");
    return json(
      checked(
        await db
          .from("tenant_settings")
          .update({ menu_published: b.published })
          .eq("tenant_id", tenant)
          .select("menu_published,menu_version")
          .single(),
      ),
    );
  }
  const match = path.match(
    /^\/api\/v1\/admin\/(categories|products|tables|staff)(?:\/([a-f0-9-]+))?(?:\/(qr|image))?$/,
  );
  if (!match) fail(404, "NOT_FOUND", "Uç bulunamadı.");
  const [, resource, rawId, action] = match!;
  const id = rawId ? uuid(rawId) : undefined;
  const table = (
    {
      tables: "dining_tables",
      staff: "memberships",
      categories: "categories",
      products: "products",
    } as const
  )[resource as "tables"];
  if (action === "qr" && id && method === "POST" && resource === "tables") {
    const qr = randomToken();
    checked(
      await db.rpc("rotate_table_qr", {
        target_tenant: tenant,
        target_table: id,
        supplied_hash: await hash(qr),
      }),
    );
    return json({ url: `${url.origin}/menu#${qr}` });
  }
  if (
    action === "image" &&
    id &&
    resource === "products" &&
    method === "POST"
  ) {
    const product = checked(
      await db
        .from("products")
        .select("id,image_path")
        .eq("tenant_id", tenant)
        .eq("id", id)
        .maybeSingle(),
    );
    if (!product) fail(404, "NOT_FOUND", "Ürün bulunamadı.");
    const bytes = await limitedBytes(request, 307200);
    if (bytes.length > 307200 || bytes.length < 12)
      fail(422, "INVALID_IMAGE", "Görsel en fazla 300 KB olmalı.");
    const type = request.headers.get("content-type");
    const png = bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    const ext =
      type === "image/png" && png
        ? "png"
        : type === "image/jpeg" && jpeg
          ? "jpg"
          : type === "image/webp" && webp
            ? "webp"
            : fail(422, "INVALID_IMAGE", "PNG, JPEG veya WebP seçin.");
    const imagePath = `${tenant}/${id}/${crypto.randomUUID()}.${ext}`;
    checked(
      await db.storage
        .from("menu-images")
        .upload(imagePath, bytes, { contentType: type!, upsert: false }),
    );
    const result = await db
      .from("products")
      .update({ image_path: imagePath })
      .eq("tenant_id", tenant)
      .eq("id", id)
      .select("id")
      .single();
    if (result.error) {
      await db.storage.from("menu-images").remove([imagePath]);
      checked(result);
    }
    if (product?.image_path)
      await db.storage.from("menu-images").remove([product.image_path]);
    return json({ image_path: imagePath });
  }
  if (action) fail(404, "NOT_FOUND", "Uç bulunamadı.");
  if (method === "GET" && !id) {
    if (resource === "staff" && membership!.role !== "owner")
      fail(403, "OWNER_REQUIRED", "Sahip yetkisi gerekli.");
    const fields = resource === "staff" ? "id,user_id,role,active" : "*";
    return json(
      checked(
        await db.from(table).select(fields).eq("tenant_id", tenant).limit(500),
      ),
    );
  }
  if (
    !["POST", "PATCH"].includes(method) ||
    (method === "PATCH" && !id) ||
    (method === "POST" && id)
  )
    fail(404, "NOT_FOUND", "Uç bulunamadı.");
  const b = await body(request),
    values: Record<string, unknown> = {};
  if ("tenant_id" in b || "id" in b || "image_path" in b)
    fail(422, "INVALID_INPUT", "Korunan alan değiştirilemez.");
  if (resource === "staff") {
    if (method === "POST") {
      values.user_id = uuid(b.user_id);
      values.role = "staff";
    }
    if (method === "PATCH") {
      if (typeof b.active !== "boolean")
        fail(422, "INVALID_INPUT", "Üyelik durumu gerekli.");
      values.active = b.active;
    }
  } else {
    if ("name" in b || method === "POST")
      values.name = text(
        b.name,
        resource === "products" ? 160 : resource === "tables" ? 80 : 120,
      );
    if (resource === "categories" || resource === "products") {
      if ("archived" in b) {
        if (typeof b.archived !== "boolean")
          fail(422, "INVALID_INPUT", "Geçersiz arşiv durumu.");
        values.archived_at = b.archived ? new Date().toISOString() : null;
      }
      if ("sort_order" in b) {
        if (
          !Number.isSafeInteger(b.sort_order) ||
          Math.abs(b.sort_order as number) > 100000
        )
          fail(422, "INVALID_INPUT", "Sıra tam sayı olmalı.");
        values.sort_order = b.sort_order;
      }
    }
    if (resource === "tables" && "active" in b) {
      if (typeof b.active !== "boolean")
        fail(422, "INVALID_INPUT", "Geçersiz masa durumu.");
      values.active = b.active;
    }
    if (resource === "products") {
      if ("category_id" in b || method === "POST")
        values.category_id = uuid(b.category_id);
      if ("price_minor" in b || method === "POST") {
        if (
          !Number.isInteger(b.price_minor) ||
          (b.price_minor as number) < 0 ||
          (b.price_minor as number) > 2147483647
        )
          fail(422, "INVALID_PRICE", "Fiyat negatif olmayan tam kuruş olmalı.");
        values.price_minor = b.price_minor;
      }
      if ("description" in b)
        values.description = text(b.description, 2000, true);
      if ("available" in b) {
        if (typeof b.available !== "boolean")
          fail(422, "INVALID_INPUT", "Geçersiz müsaitlik.");
        values.available = b.available;
      }
      if (b.remove_image === true) values.image_path = null;
    }
  }
  if (!Object.keys(values).length)
    fail(422, "INVALID_INPUT", "Değiştirilecek alan bulunamadı.");
  const previousImage =
    resource === "products" && id && b.remove_image === true
      ? checked(
          await db
            .from("products")
            .select("image_path")
            .eq("tenant_id", tenant)
            .eq("id", id)
            .single(),
        )?.image_path
      : undefined;
  const result =
    method === "POST"
      ? await db
          .from(table)
          .insert({ ...values, tenant_id: tenant })
          .select()
          .single()
      : await db
          .from(table)
          .update(values)
          .eq("tenant_id", tenant)
          .eq("id", id!)
          .select()
          .single();
  const saved = checked(result);
  if (previousImage)
    await db.storage.from("menu-images").remove([previousImage]);
  return json(saved, method === "POST" ? 201 : 200);
}
