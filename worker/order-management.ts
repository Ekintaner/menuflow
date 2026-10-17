import type { SupabaseClient } from "@supabase/supabase-js";
import { body, fail, text, uuid } from "./management";
export const statuses = [
  "pending_acceptance",
  "accepted",
  "preparing",
  "ready",
  "served",
  "rejected",
  "cancelled",
];
export function expectedVersion(v: unknown) {
  if (
    !Number.isSafeInteger(v) ||
    (v as number) < 1 ||
    (v as number) >= 2147483647
  )
    fail(422, "INVALID_INPUT", "Geçerli sürüm gerekli.");
  return v as number;
}
function checked<T>(r: {
  data: T;
  error: { message?: string; code?: string } | null;
}) {
  if (r.error) {
    const m = r.error.message;
    if (m === "VERSION_CONFLICT" || m === "INVALID_TRANSITION")
      fail(
        409,
        m,
        "Sipariş değişti veya bu geçiş yapılamaz. Listeyi yenileyin.",
      );
    if (m === "ORDER_NOT_FOUND") fail(404, "NOT_FOUND", "Sipariş bulunamadı.");
    if (r.error.code === "42501")
      fail(403, "ACCESS_DENIED", "Aktif işletme yetkisi gerekli.");
    if (m === "INVALID_INPUT")
      fail(422, m, "Geçerli durum ve ret/iptal gerekçesi gerekli.");
    fail(503, "SERVICE_UNAVAILABLE", "Sipariş servisi şu anda kullanılamıyor.");
  }
  return r.data;
}
export async function orderManagement(
  request: Request,
  db: SupabaseClient,
  tenant: string,
  owner: boolean,
): Promise<Response | undefined> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/api/v1/admin/settings") {
    if (method === "GET")
      return Response.json(
        checked(
          await db
            .from("tenant_settings")
            .select("acceptance_mode,ordering_enabled,version")
            .eq("tenant_id", tenant)
            .single(),
        ),
      );
    if (method !== "PATCH") fail(404, "NOT_FOUND", "Uç bulunamadı.");
    if (!owner)
      fail(
        403,
        "OWNER_REQUIRED",
        "Ayarlar için işletme sahibi yetkisi gerekli.",
      );
    const b = await body(request);
    if (
      Object.keys(b).some(
        (k) => !["acceptance_mode", "ordering_enabled", "version"].includes(k),
      ) ||
      !["manual", "automatic"].includes(String(b.acceptance_mode)) ||
      typeof b.ordering_enabled !== "boolean"
    )
      fail(422, "INVALID_INPUT", "Kabul modu ve sipariş alım durumu gerekli.");
    const r = checked(
      await db
        .from("tenant_settings")
        .update({
          acceptance_mode: b.acceptance_mode,
          ordering_enabled: b.ordering_enabled,
        })
        .eq("tenant_id", tenant)
        .eq("version", expectedVersion(b.version))
        .select("acceptance_mode,ordering_enabled,version")
        .maybeSingle(),
    );
    if (!r)
      fail(
        409,
        "VERSION_CONFLICT",
        "Ayarlar değişti. Yenileyip tekrar deneyin.",
      );
    return Response.json(r);
  }
  const match = path.match(
    /^\/api\/v1\/admin\/orders(?:\/([a-f0-9-]+))?(\/transitions)?$/,
  );
  if (!match) return;
  const id = match[1] ? uuid(match[1]) : undefined;
  if (id && match[2] && method === "POST") {
    const b = await body(request);
    if (
      Object.keys(b).some(
        (k) => !["version", "status", "reason"].includes(k),
      ) ||
      !statuses.includes(String(b.status))
    )
      fail(422, "INVALID_INPUT", "Geçerli hedef durum gerekli.");
    const reason = b.reason === undefined ? null : text(b.reason, 500, true);
    if (["rejected", "cancelled"].includes(String(b.status)) && !reason)
      fail(422, "INVALID_INPUT", "Ret veya iptal gerekçesi gerekli.");
    return Response.json(
      checked(
        await db.rpc("transition_order", {
          target_tenant: tenant,
          target_order: id,
          expected_version: expectedVersion(b.version),
          target_status: b.status,
          supplied_reason: reason,
        }),
      ),
    );
  }
  if (method !== "GET" || match[2]) fail(404, "NOT_FOUND", "Uç bulunamadı.");
  const fields =
    "id,table_id,status,total_minor,currency,acceptance_mode,version,note,created_at,dining_tables(name),order_items(product_name,unit_price_minor,quantity,line_total_minor)";
  if (id) {
    const row = checked(
      await db
        .from("orders")
        .select(
          fields +
            ",order_events(id,from_status,to_status,actor_id,reason,created_at)",
        )
        .eq("tenant_id", tenant)
        .eq("id", id)
        .maybeSingle(),
    );
    if (!row) fail(404, "NOT_FOUND", "Sipariş bulunamadı.");
    return Response.json(row);
  }
  let q = db.from("orders").select(fields).eq("tenant_id", tenant);
  const p = url.searchParams,
    status = p.get("status") ?? "active";
  if (status === "active") q = q.in("status", statuses.slice(0, 4));
  else if (status === "history") q = q.in("status", statuses.slice(4));
  else if (status !== "all") {
    if (!statuses.includes(status))
      fail(422, "INVALID_INPUT", "Geçersiz durum filtresi.");
    q = q.eq("status", status);
  }
  if (p.has("table")) q = q.eq("table_id", uuid(p.get("table")));
  for (const key of ["from", "to"])
    if (p.has(key)) {
      const value = p.get(key)!;
      if (
        !/^\d{4}-\d\d-\d\dT/.test(value) ||
        !Number.isFinite(Date.parse(value))
      )
        fail(422, "INVALID_INPUT", "Geçersiz tarih.");
      q =
        key === "from"
          ? q.gte("created_at", new Date(value).toISOString())
          : q.lt("created_at", new Date(value).toISOString());
    }
  const limit = Number(p.get("limit") ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    fail(422, "INVALID_INPUT", "Liste sınırı 1–100 olmalı.");
  if (p.has("cursor")) {
    const [date, rawId, ...rest] = p.get("cursor")!.split("|");
    if (
      rest.length ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{1,6}(?:Z|\+00:00)$/.test(date) ||
      !Number.isFinite(Date.parse(date))
    )
      fail(422, "INVALID_INPUT", "Geçersiz sayfa anahtarı.");
    const cursorId = uuid(rawId);
    q = q.or(
      `created_at.lt.${date},and(created_at.eq.${date},id.lt.${cursorId})`,
    );
  }
  const rows = checked(
    await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1),
  );
  const more = rows!.length > limit,
    items = rows!.slice(0, limit),
    last = items.at(-1);
  return Response.json({
    items,
    next_cursor: more && last ? `${last.created_at}|${last.id}` : null,
  });
}
