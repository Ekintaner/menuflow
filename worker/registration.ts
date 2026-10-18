import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./index";
import {
  body,
  cookie,
  fail,
  hash,
  sessionCookie,
  text,
  uuid,
} from "./management";
import { createUserDatabase } from "./supabase";
function elevated(env: Env) {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_PUBLISHABLE_KEY
  )
    fail(503, "NOT_CONFIGURED", "Servis henüz yapılandırılmadı.");
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function publicRegistration(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method !== "POST") fail(404, "NOT_FOUND", "Uç bulunamadı.");
  if (request.headers.get("origin") !== url.origin)
    fail(403, "ORIGIN_DENIED", "İstek kaynağı doğrulanamadı.");
  if (!env.AUTH_LIMIT)
    fail(503, "NOT_CONFIGURED", "Başvuru servisi henüz yapılandırılmadı.");
  if (
    !(
      await env.AUTH_LIMIT!.limit({
        key: `registration:${await hash(request.headers.get("cf-connecting-ip") ?? "local")}`,
      })
    ).success
  )
    fail(429, "RATE_LIMIT", "Lütfen bir dakika sonra tekrar deneyin.");
  const b = await body(request),
    db = elevated(env);
  if (url.pathname === "/api/v1/auth/registration") {
    const email = text(b.email, 254).toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      Object.keys(b).some(
        (k) =>
          !["email", "applicant_name", "business_name", "phone"].includes(k),
      )
    )
      fail(422, "INVALID_INPUT", "Başvuru bilgilerini kontrol edin.");
    if (
      !(
        await env.AUTH_LIMIT!.limit({
          key: `registration-email:${await hash(email)}`,
        })
      ).success
    )
      fail(429, "RATE_LIMIT", "Lütfen bir dakika sonra tekrar deneyin.");
    const r = await db.from("registration_requests").insert({
      email,
      applicant_name: text(b.applicant_name, 120),
      business_name: text(b.business_name, 120),
      phone: b.phone ? text(b.phone, 32) : null,
    });
    if (r.error && r.error.code !== "23505")
      fail(503, "SERVICE_UNAVAILABLE", "Başvuru şu anda alınamıyor.");
    return Response.json(
      {
        message:
          "Başvurunuz alındı. Uygun başvurular yönetici incelemesi ve hesap etkinleştirmesinden sonra açılır.",
      },
      { status: 202 },
    );
  }
  if (url.pathname === "/api/v1/auth/activation-session") {
    if (
      !["invite", "recovery"].includes(String(b.type)) ||
      typeof b.token_hash !== "string" ||
      !/^[A-Za-z0-9_-]{32,512}$/.test(b.token_hash)
    )
      fail(
        401,
        "INVALID_ACTIVATION",
        "Etkinleştirme bağlantısı geçersiz veya süresi dolmuş.",
      );
    const verifier = createClient(
      env.SUPABASE_URL!,
      env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const verified = await verifier.auth.verifyOtp({
      token_hash: b.token_hash as string,
      type: b.type as "invite" | "recovery",
    });
    if (
      verified.error ||
      !verified.data.session ||
      !verified.data.user?.email_confirmed_at
    )
      fail(
        401,
        "INVALID_ACTIVATION",
        "Etkinleştirme bağlantısı geçersiz veya süresi dolmuş.",
      );
    const userId = verified.data.user!.id;
    const allowed = await db
      .from("registration_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "approved")
      .limit(1);
    if (allowed.error)
      fail(503, "SERVICE_UNAVAILABLE", "Onay şu anda doğrulanamıyor.");
    if (userId !== env.PLATFORM_ADMIN_USER_ID && !allowed.data?.length)
      fail(403, "APPROVAL_REQUIRED", "Yönetici onayı gerekli.");
    return Response.json(
      { ready: true },
      {
        headers: {
          "Set-Cookie": sessionCookie(
            request,
            "mf_activation",
            verified.data.session!.access_token,
            600,
          ),
        },
      },
    );
  }
  if (url.pathname !== "/api/v1/auth/activate")
    fail(404, "NOT_FOUND", "Uç bulunamadı.");
  const token = cookie(request, "mf_activation");
  if (!token)
    fail(401, "INVALID_ACTIVATION", "Etkinleştirme bağlantısını tekrar açın.");
  const identity = await createUserDatabase(env, token).auth.getUser(token);
  if (identity.error || !identity.data.user)
    fail(401, "INVALID_ACTIVATION", "Etkinleştirme süresi doldu.");
  let issued = 0;
  try {
    issued = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ).iat;
  } catch {
    fail(401, "INVALID_ACTIVATION", "Etkinleştirme süresi doldu.");
  }
  if (!issued || Date.now() / 1000 - issued > 600)
    fail(401, "INVALID_ACTIVATION", "Etkinleştirme süresi doldu.");
  const userId = identity.data.user!.id,
    admin = userId === env.PLATFORM_ADMIN_USER_ID;
  const allowed = await db
    .from("registration_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .limit(1);
  if (allowed.error)
    fail(503, "SERVICE_UNAVAILABLE", "Onay şu anda doğrulanamıyor.");
  if (!admin && !allowed.data?.length)
    fail(403, "APPROVAL_REQUIRED", "Yönetici onayı gerekli.");
  if (
    typeof b.password !== "string" ||
    b.password.length < 12 ||
    b.password.length > 128
  )
    fail(422, "INVALID_INPUT", "Parola 12–128 karakter olmalı.");
  const updated = await db.auth.admin.updateUserById(userId, {
    password: b.password as string,
  });
  if (updated.error)
    fail(
      422,
      "PASSWORD_REJECTED",
      "Parola kabul edilmedi. Daha güçlü bir parola deneyin.",
    );
  if (!admin) {
    const result = await db.rpc("activate_registration", { auth_user: userId });
    if (result.error)
      fail(
        503,
        "ACTIVATION_PENDING",
        "Parola kaydedildi ancak üyelik tamamlanamadı. Bu sayfadan tekrar deneyin.",
      );
  }
  return Response.json(
    { activated: true },
    {
      headers: { "Set-Cookie": sessionCookie(request, "mf_activation", "", 0) },
    },
  );
}
export async function registrationAdministration(
  request: Request,
  db: SupabaseClient,
  actor: string,
) {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/v1/platform/overview" && request.method === "GET") {
    const result = await Promise.all([
      db.from("tenants").select("id", { count: "exact", head: true }),
      db
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      db
        .from("registration_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]),
      db
        .from("table_checks")
        .select("id", { count: "exact", head: true })
        .eq("state", "open"),
    ]);
    if (result.some((r) => r.error))
      fail(503, "SERVICE_UNAVAILABLE", "Özet alınamadı.");
    return Response.json({
      restaurants: result[0].count,
      active_restaurants: result[1].count,
      pending: result[2].count,
      open_checks: result[3].count,
    });
  }
  if (path === "/api/v1/platform/audit" && request.method === "GET") {
    const r = await db
      .from("platform_audit_logs")
      .select("id,actor_id,action,target_id,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (r.error) fail(503, "SERVICE_UNAVAILABLE", "İşlem geçmişi alınamadı.");
    return Response.json(r.data);
  }
  if (path === "/api/v1/platform/registrations" && request.method === "GET") {
    const status = url.searchParams.get("status") ?? "pending";
    if (
      !["pending", "processing", "approved", "rejected", "activated"].includes(
        status,
      )
    )
      fail(422, "INVALID_INPUT", "Geçersiz durum.");
    let q = db
      .from("registration_requests")
      .select(
        "id,applicant_name,email,business_name,phone,status,created_at,reviewed_at,tenant_id,version",
      )
      .eq("status", status)
      .order("id")
      .limit(51);
    const after = url.searchParams.get("after");
    if (after) q = q.gt("id", uuid(after));
    const r = await q;
    if (r.error) fail(503, "SERVICE_UNAVAILABLE", "Başvurular alınamadı.");
    const rows = r.data ?? [];
    return Response.json({
      requests: rows.slice(0, 50),
      next: rows.length > 50 ? rows[49].id : null,
    });
  }
  const state = path.match(
    /^\/api\/v1\/platform\/restaurants\/([a-f0-9-]+)\/state$/,
  );
  if (state && request.method === "POST") {
    const b = await body(request);
    if (typeof b.active !== "boolean")
      fail(422, "INVALID_INPUT", "Restoran durumu gerekli.");
    const r = await db.rpc("platform_restaurant_state", {
      target_tenant: uuid(state[1]),
      actor,
      enabled: b.active,
      supplied_reason: text(b.reason, 500),
    });
    if (r.error)
      fail(422, "OPERATION_FAILED", "Restoran durumu güncellenemedi.");
    return Response.json({ active: b.active });
  }
  const match = path.match(
    /^\/api\/v1\/platform\/registrations\/([a-f0-9-]+)\/(approve|reject|invite)$/,
  );
  if (!match) return;
  if (request.method !== "POST") fail(404, "NOT_FOUND", "Uç bulunamadı.");
  const b = await body(request),
    id = uuid(match[1]),
    claim = crypto.randomUUID();
  if (match[2] === "invite") {
    const row = await db
      .from("registration_requests")
      .select("email,user_id")
      .eq("id", id)
      .eq("status", "approved")
      .maybeSingle();
    if (row.error || !row.data)
      fail(
        409,
        "REVIEW_CONFLICT",
        "Etkinleştirme bekleyen başvuru bulunamadı.",
      );
    let type: "invite" | "recovery" = "invite";
    let invitation = await db.auth.admin.generateLink({
      type,
      email: row.data!.email,
    });
    if (
      invitation.error &&
      ["email_exists", "user_already_exists"].includes(
        invitation.error.code ?? "",
      )
    ) {
      type = "recovery";
      invitation = await db.auth.admin.generateLink({
        type,
        email: row.data!.email,
      });
    }
    if (
      invitation.error ||
      invitation.data.user?.id !== row.data!.user_id ||
      !invitation.data.properties?.hashed_token
    )
      fail(503, "INVITATION_FAILED", "Bağlantı yenilenemedi.");
    const audit = await db.from("platform_audit_logs").insert({
      actor_id: actor,
      action: "registration:invite",
      target_id: id,
    });
    if (audit.error)
      fail(503, "SERVICE_UNAVAILABLE", "İşlem kaydedilemedi. Tekrar deneyin.");
    return Response.json({
      activation_url: `${url.origin}/activate#token_hash=${invitation.data.properties!.hashed_token}&type=${type}`,
    });
  }
  const initial = await db.rpc("review_registration", {
    operation: "claim",
    target_request: id,
    actor,
    claim,
  });
  if (initial.error)
    fail(
      409,
      "REVIEW_CONFLICT",
      "Başvuru değişti veya inceleniyor. Listeyi yenileyin.",
    );
  try {
    if (match[2] === "reject") {
      const r = await db.rpc("review_registration", {
        operation: "reject",
        target_request: id,
        actor,
        claim,
        supplied_reason: text(b.reason, 500),
      });
      if (r.error) fail(409, "REVIEW_CONFLICT", "Başvuru reddedilemedi.");
      return Response.json({ status: "rejected" });
    }
    if (
      !Number.isInteger(b.table_count) ||
      Number(b.table_count) < 1 ||
      Number(b.table_count) > 100
    )
      fail(422, "INVALID_INPUT", "Masa sayısı 1–100 olmalı.");
    const email = initial.data.email as string;
    let type: "invite" | "recovery" = "invite";
    let link = await db.auth.admin.generateLink({ type, email });
    if (
      link.error &&
      ["email_exists", "user_already_exists"].includes(link.error.code ?? "")
    ) {
      type = "recovery";
      link = await db.auth.admin.generateLink({ type, email });
    }
    if (link.error || !link.data.user || !link.data.properties?.hashed_token)
      fail(
        503,
        "INVITATION_FAILED",
        "Etkinleştirme bağlantısı üretilemedi; başvuruyu yeniden deneyin.",
      );
    if (link.data.user!.id === actor)
      fail(
        422,
        "INVALID_INPUT",
        "Platform yöneticisi hesabı işletme başvurusu olarak kullanılamaz.",
      );
    const result = await db.rpc("review_registration", {
      operation: "approve",
      target_request: id,
      actor,
      claim,
      auth_user: link.data.user!.id,
      table_count: b.table_count,
    });
    if (result.error)
      fail(
        503,
        "APPROVAL_PENDING",
        "Onay tamamlanamadı. Listeyi yenileyip durumu kontrol edin.",
      );
    return Response.json({
      status: "approved",
      tenant_id: result.data.tenant_id,
      activation_url: `${url.origin}/activate#token_hash=${link.data.properties!.hashed_token}&type=${type}`,
    });
  } catch (e) {
    await db.rpc("review_registration", {
      operation: "release",
      target_request: id,
      actor,
      claim,
    });
    throw e;
  }
}
