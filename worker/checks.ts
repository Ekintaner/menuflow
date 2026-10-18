import type { SupabaseClient } from "@supabase/supabase-js";
import { body, fail, text, uuid } from "./management";
import { expectedVersion } from "./order-management";
export async function checks(
  request: Request,
  db: SupabaseClient,
  tenant: string,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/checks(?:\/([a-f0-9-]+))?(\/settle)?$/,
    );
  if (!match) return;
  const checked = <T>(r: {
    data: T;
    error: { message?: string; code?: string } | null;
  }) => {
    if (r.error) {
      const m = r.error.message ?? "";
      if (r.error.code === "42501")
        fail(403, "ACCESS_DENIED", "Aktif işletme yetkisi gerekli.");
      if (m === "CHECK_NOT_FOUND")
        fail(404, "NOT_FOUND", "Adisyon bulunamadı.");
      if (
        [
          "VERSION_CONFLICT",
          "SETTLEMENT_CONFLICT",
          "ACTIVE_ORDERS",
          "TOTAL_CHANGED",
          "CHECK_CLOSED",
        ].includes(m)
      )
        fail(
          409,
          m,
          m === "ACTIVE_ORDERS"
            ? "Önce açık siparişleri teslim edin veya gerekçeyle iptal edin."
            : "Adisyon değişti veya kapandı. Yenileyip kontrol edin.",
        );
      if (m === "INVALID_INPUT")
        fail(422, m, "Geçerli işlem ve iptal gerekçesi gerekli.");
      fail(503, "SERVICE_UNAVAILABLE", "Adisyonlar şu anda kullanılamıyor.");
    }
    return r.data;
  };
  const id = match[1] ? uuid(match[1]) : null;
  if (request.method === "GET" && !match[2]) {
    const args: Record<string, unknown> = {
      target_tenant: tenant,
      target_check: id,
      history: url.searchParams.get("history") === "true",
    };
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      const [time, key] = cursor.split("|");
      if (!Number.isFinite(Date.parse(time)))
        fail(422, "INVALID_INPUT", "Geçersiz sayfa.");
      args.before_time = time;
      args.before_id = uuid(key);
    }
    const result = checked(await db.rpc("read_table_checks", args));
    if (id && !result) fail(404, "NOT_FOUND", "Adisyon bulunamadı.");
    return Response.json(result);
  }
  if (request.method === "POST" && id && match[2]) {
    const b = await body(request),
      key = text(request.headers.get("idempotency-key"), 200);
    if (
      !["pay", "void"].includes(String(b.action)) ||
      !Number.isSafeInteger(b.expected_total_minor) ||
      Number(b.expected_total_minor) < 0 ||
      Object.keys(b).some(
        (k) =>
          !["action", "version", "expected_total_minor", "reason"].includes(k),
      )
    )
      fail(422, "INVALID_INPUT", "Geçerli tahsilat işlemi gerekli.");
    return Response.json(
      checked(
        await db.rpc("settle_check", {
          target_tenant: tenant,
          target_check: id,
          expected_version: expectedVersion(b.version),
          request_key: key,
          settlement_action: b.action,
          expected_total: b.expected_total_minor,
          supplied_reason:
            b.reason === undefined ? null : text(b.reason, 500, true),
        }),
      ),
    );
  }
  fail(404, "NOT_FOUND", "Uç bulunamadı.");
}
