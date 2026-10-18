import { createClient } from "@supabase/supabase-js";
import { registrationAdministration } from "./registration";
import {
  body,
  cookie,
  fail,
  hash,
  randomToken,
  text,
  uuid,
} from "./management";
import { createUserDatabase } from "./supabase";
import type { Env } from "./index";

export async function platform(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (!env.PLATFORM_ADMIN_USER_ID)
    fail(
      503,
      "PLATFORM_DISABLED",
      "Platform yönetimi henüz etkinleştirilmedi.",
    );
  if (method !== "GET" && request.headers.get("origin") !== url.origin)
    fail(403, "ORIGIN_DENIED", "İstek kaynağı doğrulanamadı.");
  const token = cookie(request, "mf_admin");
  if (!token) fail(401, "AUTH_REQUIRED", "Platform yöneticisi girişi gerekli.");
  const { data, error } = await createUserDatabase(env, token).auth.getUser(
    token,
  );
  if (error || !data.user) fail(401, "AUTH_REQUIRED", "Tekrar giriş yapın.");
  // Exact server-configured Auth UUID only. Tenant owner roles or editable metadata confer no access.
  if (data.user!.id !== env.PLATFORM_ADMIN_USER_ID)
    fail(
      403,
      "PLATFORM_FORBIDDEN",
      "Bu hesap platform yönetimine yetkili değil.",
    );
  const limiter = method === "GET" ? env.MENU_LIMIT : env.ORDER_LIMIT;
  if (
    limiter &&
    !(await limiter.limit({ key: `platform:${data.user!.id}` })).success
  )
    fail(429, "RATE_LIMIT", "Bir dakika sonra tekrar deneyin.");
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    fail(503, "NOT_CONFIGURED", "Servis henüz yapılandırılmadı.");
  const db = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const registrationResponse = await registrationAdministration(
    request,
    db,
    data.user!.id,
  );
  if (registrationResponse) return registrationResponse;
  const checked = <T>(r: { data: T; error: { code?: string } | null }): T => {
    if (r.error) {
      if (r.error.code === "23505")
        fail(409, "CONFLICT", "Bu kısa ad zaten kullanılıyor.");
      if (r.error.code === "P0002")
        fail(404, "NOT_FOUND", "Aktif restoran veya masa bulunamadı.");
      if (["22023", "23503", "23514"].includes(r.error.code ?? ""))
        fail(
          422,
          "INVALID_INPUT",
          "Alanları, sahip hesabını ve 100 masa sınırını kontrol edin.",
        );
      fail(503, "OPERATION_FAILED", "İşlem tamamlanamadı.");
    }
    return r.data;
  };
  const membershipMatch = path.match(
    /^\/api\/v1\/platform\/restaurants\/([a-f0-9-]+)\/memberships$/,
  );
  if (membershipMatch) {
    const tenant = uuid(membershipMatch[1]);
    if (method === "GET")
      return Response.json(
        checked(
          await db
            .from("memberships")
            .select("id,user_id,role,active")
            .eq("tenant_id", tenant)
            .order("id")
            .limit(200),
        ),
      );
    if (!["POST", "PATCH"].includes(method))
      fail(404, "NOT_FOUND", "Uç bulunamadı.");
    const b = await body(request);
    if (method === "POST" && !["owner", "staff"].includes(String(b.role)))
      fail(422, "INVALID_INPUT", "İşletme sahibi veya çalışan rolü seçin.");
    if (method === "PATCH" && typeof b.active !== "boolean")
      fail(422, "INVALID_INPUT", "Üyelik durumu gerekli.");
    const result = await db.rpc("platform_membership", {
      operation: method === "POST" ? "grant" : "set_active",
      actor: data.user!.id,
      target_tenant: tenant,
      target_user: uuid(b.user_id),
      member_role: method === "POST" ? b.role : null,
      member_active: method === "POST" ? true : b.active,
    });
    if (result.error?.message === "LAST_OWNER")
      fail(
        409,
        "LAST_OWNER",
        "İşletmenin son aktif sahibi kapatılamaz veya çalışan yapılamaz.",
      );
    return Response.json({ id: checked(result) });
  }
  if (path === "/api/v1/platform/accounts" && method === "POST") {
    const b = await body(request),
      tenant = uuid(b.tenant_id),
      email = text(b.email, 254).toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof b.password !== "string" ||
      b.password.length < 12 ||
      b.password.length > 128 ||
      !["owner", "staff"].includes(String(b.role))
    )
      fail(
        422,
        "INVALID_INPUT",
        "Geçerli e-posta, en az 12 karakterli parola ve işletme rolü gerekli.",
      );
    const existing = checked(
      await db
        .from("tenants")
        .select("id")
        .eq("id", tenant)
        .eq("active", true)
        .maybeSingle(),
    );
    if (!existing) fail(404, "NOT_FOUND", "Aktif restoran bulunamadı.");
    // Manual provisioning: no invitation email, public signup or editable platform claims.
    const created = await db.auth.admin.createUser({
      email,
      password: b.password as string,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      fail(
        422,
        "ACCOUNT_CREATE_FAILED",
        "Hesap açılamadı; e-posta zaten kayıtlıysa mevcut hesaba üyelik verin. Sonuç belirsizse önce hesabı kontrol edin.",
      );
    const userId = created.data.user!.id;
    const assigned = await db.rpc("platform_membership", {
      operation: "grant",
      actor: data.user!.id,
      target_tenant: tenant,
      target_user: userId,
      member_role: b.role,
      member_active: true,
    });
    // Auth and PostgreSQL cannot share a transaction. Keep failures recoverable and explicit.
    // Never delete an account when the outcome of the membership write is uncertain.
    if (assigned.error)
      return Response.json(
        {
          user_id: userId,
          membership_assigned: false,
          message:
            "Hesap açıldı ancak üyelik doğrulanamadı. Listeyi yenileyin; üyelik yoksa bu hesap UUID'siyle mevcut hesaba üyelik verin.",
        },
        { status: 202 },
      );
    return Response.json(
      { user_id: userId, membership_assigned: true },
      { status: 201 },
    );
  }
  if (path === "/api/v1/platform/restaurants" && method === "GET") {
    let query = db
      .from("tenants")
      .select("id,name,slug,currency,timezone,active,dining_tables(count)")
      .order("id")
      .limit(51);
    const after = url.searchParams.get("after");
    if (after) query = query.gt("id", uuid(after));
    const rows = checked(await query) ?? [];
    return Response.json({
      restaurants: rows.slice(0, 50),
      next: rows.length > 50 ? rows[49].id : null,
    });
  }
  if (path === "/api/v1/platform/restaurants" && method === "POST") {
    const b = await body(request),
      slug = text(b.slug, 80);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      fail(422, "INVALID_INPUT", "Kısa ad küçük harf, rakam ve tire içermeli.");
    if (
      !Number.isInteger(b.table_count) ||
      Number(b.table_count) < 1 ||
      Number(b.table_count) > 100
    )
      fail(422, "INVALID_INPUT", "Masa sayısı 1–100 olmalı.");
    const id = checked(
      await db.rpc("platform_provision", {
        operation: "create",
        actor: data.user!.id,
        restaurant_name: text(b.name, 120),
        restaurant_slug: slug,
        owner_user: b.owner_user_id ? uuid(b.owner_user_id) : data.user!.id,
        table_count: b.table_count,
      }),
    );
    return Response.json({ id }, { status: 201 });
  }
  const match = path.match(
    /^\/api\/v1\/platform\/restaurants\/([a-f0-9-]+)\/tables(?:\/([a-f0-9-]+)\/qr)?$/,
  );
  if (!match) fail(404, "NOT_FOUND", "Uç bulunamadı.");
  const tenant = uuid(match![1]),
    table = match![2] ? uuid(match![2]) : null;
  if (!table && method === "GET")
    return Response.json(
      checked(
        await db
          .from("dining_tables")
          .select("id,name,active")
          .eq("tenant_id", tenant)
          .order("name")
          .limit(100),
      ),
    );
  if (method !== "POST") fail(404, "NOT_FOUND", "Uç bulunamadı.");
  const b = await body(request);
  if (table) {
    if (b.confirm_rotation !== true)
      fail(
        422,
        "CONFIRM_REQUIRED",
        "QR yenileme onayı gerekli; eski QR ve oturumlar iptal edilir.",
      );
    const qr = randomToken();
    checked(
      await db.rpc("platform_provision", {
        operation: "rotate_qr",
        actor: data.user!.id,
        target_tenant: tenant,
        target_table: table,
        supplied_hash: await hash(qr),
      }),
    );
    return Response.json({ url: `${url.origin}/menu#${qr}` });
  }
  if (
    !Number.isInteger(b.count) ||
    Number(b.count) < 1 ||
    Number(b.count) > 100
  )
    fail(422, "INVALID_INPUT", "Eklenecek masa sayısı 1–100 olmalı.");
  checked(
    await db.rpc("platform_provision", {
      operation: "add_tables",
      actor: data.user!.id,
      target_tenant: tenant,
      table_count: b.count,
    }),
  );
  return Response.json({ added: b.count }, { status: 201 });
}
