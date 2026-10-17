import { afterEach, expect, it, vi } from "vitest";
import { fetchRequest } from "../../worker/index";
const env = {
  SUPABASE_URL: "https://db.test",
  SUPABASE_SERVICE_ROLE_KEY: "server-test",
};
const product = "40000000-0000-0000-0000-000000000001";
function req(
  path: string,
  data?: unknown,
  options: { origin?: string; cookie?: string; key?: string } = {},
) {
  return new Request(`https://app.test/api/v1${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      origin: options.origin ?? "https://app.test",
      cookie: options.cookie ?? `mf_guest=${"c".repeat(64)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": options.key ?? "attempt-1",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
const payload = {
  items: [{ product_id: product, quantity: 2 }],
  session_id: product,
  version: 4,
};
afterEach(() => vi.unstubAllGlobals());
it("creates a separate secure guest cookie with only hashes sent upstream", async () => {
  const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const b = JSON.parse(init?.body as string);
    expect(b.qr_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(b.qr_hash).not.toBe("a".repeat(64));
    expect(b.guest_hash).toMatch(/^[a-f0-9]{64}$/);
    return Response.json(true);
  });
  vi.stubGlobal("fetch", fetch);
  const r = await fetchRequest(
    req("/guest-sessions", { token: "a".repeat(64) }),
    env,
  );
  expect(r.status).toBe(201);
  expect(await r.json()).toEqual({ created: true });
  expect(r.headers.get("set-cookie")).toMatch(
    /mf_guest=[a-f0-9]{64};.*HttpOnly; SameSite=Strict; Max-Age=14400; Secure/,
  );
});
it("rejects cross origin and missing guest before database access", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    (
      await fetchRequest(
        req("/orders", payload, { origin: "https://evil.test" }),
        env,
      )
    ).status,
  ).toBe(403);
  expect(
    (await fetchRequest(req("/orders", payload, { cookie: "" }), env)).status,
  ).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  { ...payload, total_minor: 1 },
  { ...payload, tenant_id: product },
  { ...payload, items: [{ product_id: product, quantity: 21 }] },
  { ...payload, items: [{ product_id: product, quantity: 1.5 }] },
  { ...payload, items: [] },
  { ...payload, items: [payload.items[0], payload.items[0]] },
  { ...payload, note: "x".repeat(501) },
])("rejects malformed or forged order %j", async (p) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await fetchRequest(req("/orders", p), env)).status).toBe(422);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([false, true])(
  "returns canonical server response and replay status %s",
  async (replayed) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_i: unknown, init?: RequestInit) => {
        const b = JSON.parse(init?.body as string);
        expect(b.payload).toEqual({ ...payload, note: "" });
        expect(b.idem_key).toBe("attempt-1");
        expect(b.guest_hash).not.toBe("c".repeat(64));
        return Response.json({
          replayed,
          order: {
            id: product,
            total_minor: 2500,
            status: "pending_acceptance",
          },
        });
      }),
    );
    const r = await fetchRequest(req("/orders", payload), env);
    expect(r.status).toBe(replayed ? 200 : 201);
    expect((await r.json()).total_minor).toBe(2500);
    expect(r.headers.get("cache-control")).toBe("no-store");
  },
);
it.each([
  ["MENU_CHANGED", 409],
  ["IDEMPOTENCY_CONFLICT", 409],
  ["PRODUCT_UNAVAILABLE", 422],
  ["SESSION_REQUIRED", 401],
  ["RATE_LIMIT", 429],
  ["unknown detail", 503],
])("maps database error %s safely", async (code, status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ message: code, code: "P0001" }, { status: 400 }),
    ),
  );
  const r = await fetchRequest(req("/orders", payload), env);
  expect(r.status).toBe(status);
  if (status === 503)
    expect(JSON.stringify(await r.json())).not.toContain(code);
});
it("unknown order does not expose another guest", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(null)),
  );
  expect((await fetchRequest(req(`/orders/${product}`), env)).status).toBe(404);
});

it("enforces order request throttling without exposing upstream or session data", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const r = await fetchRequest(req("/orders", payload), {
    ...env,
    ORDER_LIMIT: { limit: async () => ({ success: false }) },
  });
  expect(r.status).toBe(429);
  expect(r.headers.get("retry-after")).toBe("60");
  expect(fetch).not.toHaveBeenCalled();
});
