import { afterEach, expect, it, vi } from "vitest";
import { fetchRequest } from "../../worker/index";
const tenant = "10000000-0000-0000-0000-000000000001",
  id = "10000000-0000-0000-0000-000000000002";
const env = {
  SUPABASE_URL: "https://db.test",
  SUPABASE_PUBLISHABLE_KEY: "public-test",
};
function req(
  path: string,
  data?: unknown,
  method = "POST",
  origin = "https://app.test",
) {
  return new Request("https://app.test/api/v1/admin/" + path, {
    method: data === undefined ? "GET" : method,
    headers: {
      origin,
      cookie: "mf_admin=test",
      "content-type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
function upstream(role = "staff", error?: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id });
    if (url.includes("/memberships"))
      return Response.json(role === "none" ? null : { role });
    if (url.includes("/rpc/transition_order"))
      return error
        ? Response.json({ code: "P0001", message: error }, { status: 400 })
        : Response.json({ id, status: "accepted", version: 2 });
    if (url.includes("/tenant_settings"))
      return Response.json(
        init?.method === "PATCH" && error
          ? null
          : { acceptance_mode: "manual", ordering_enabled: true, version: 1 },
      );
    if (url.includes("/orders"))
      return Response.json([
        { id, created_at: "2026-10-18T00:00:00.123456+00:00" },
      ]);
    throw Error(url);
  });
}
afterEach(() => vi.unstubAllGlobals());
it("admin orders requires authentication", async () => {
  expect(
    (
      await fetchRequest(
        new Request("https://app.test/api/v1/admin/orders"),
        env,
      )
    ).status,
  ).toBe(401);
});
it("checks Origin before writes", async () => {
  const mock = upstream();
  vi.stubGlobal("fetch", mock);
  expect(
    (
      await fetchRequest(
        req(
          `orders/${id}/transitions?tenant=${tenant}`,
          {},
          "POST",
          "https://evil.test",
        ),
        env,
      )
    ).status,
  ).toBe(403);
  expect(mock).not.toHaveBeenCalled();
});
it.each(["owner", "staff"])(
  "permits %s transitions using user credentials",
  async (role) => {
    const mock = upstream(role);
    vi.stubGlobal("fetch", mock);
    const r = await fetchRequest(
      req(`orders/${id}/transitions?tenant=${tenant}`, {
        status: "accepted",
        version: 1,
      }),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ version: 2 });
    const call = mock.mock.calls.find((c) => String(c[0]).includes("/rpc/"));
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      target_tenant: tenant,
      target_order: id,
      expected_version: 1,
    });
    expect(r.headers.get("cache-control")).toBe("no-store");
  },
);
it("rejects inactive membership", async () => {
  vi.stubGlobal("fetch", upstream("none"));
  expect((await fetchRequest(req(`orders?tenant=${tenant}`), env)).status).toBe(
    403,
  );
});
it.each([
  { status: "rejected", version: 1 },
  { status: "cancelled", version: 1, reason: "  " },
  { status: "served", version: 0 },
  { status: "accepted", version: 1.5 },
  { status: "unknown", version: 1 },
  { status: "accepted", version: 1, tenant_id: tenant },
  { status: "accepted", version: 1, reason: "a".repeat(501) },
])("rejects invalid transition %j", async (payload) => {
  const mock = upstream();
  vi.stubGlobal("fetch", mock);
  expect(
    (
      await fetchRequest(
        req(`orders/${id}/transitions?tenant=${tenant}`, payload),
        env,
      )
    ).status,
  ).toBe(422);
  expect(mock.mock.calls.some((c) => String(c[0]).includes("/rpc/"))).toBe(
    false,
  );
});
it.each([
  ["VERSION_CONFLICT", 409],
  ["INVALID_TRANSITION", 409],
  ["ORDER_NOT_FOUND", 404],
  ["INVALID_INPUT", 422],
  ["database internals secret", 503],
])("maps %s safely", async (message, status) => {
  vi.stubGlobal("fetch", upstream("staff", String(message)));
  const r = await fetchRequest(
    req(`orders/${id}/transitions?tenant=${tenant}`, {
      status: "accepted",
      version: 1,
    }),
    env,
  );
  expect(r.status).toBe(status);
  expect(await r.text()).not.toContain("internals");
});
it("owner settings use compare-and-set", async () => {
  const mock = upstream("owner");
  vi.stubGlobal("fetch", mock);
  expect(
    (
      await fetchRequest(
        req(
          `settings?tenant=${tenant}`,
          { version: 2, acceptance_mode: "automatic", ordering_enabled: true },
          "PATCH",
        ),
        env,
      )
    ).status,
  ).toBe(200);
  const call = mock.mock.calls.find((c) =>
    String(c[0]).includes("/tenant_settings"),
  );
  expect(String(call?.[0])).toContain("version=eq.2");
  expect(JSON.parse(String(call?.[1]?.body))).not.toHaveProperty("version");
});
it("staff cannot change settings", async () => {
  vi.stubGlobal("fetch", upstream());
  expect(
    (
      await fetchRequest(
        req(
          `settings?tenant=${tenant}`,
          { version: 1, acceptance_mode: "automatic", ordering_enabled: true },
          "PATCH",
        ),
        env,
      )
    ).status,
  ).toBe(403);
});
it("stale settings returns 409", async () => {
  vi.stubGlobal("fetch", upstream("owner", "stale"));
  expect(
    (
      await fetchRequest(
        req(
          `settings?tenant=${tenant}`,
          { version: 1, acceptance_mode: "automatic", ordering_enabled: true },
          "PATCH",
        ),
        env,
      )
    ).status,
  ).toBe(409);
});
it.each([
  "limit=101",
  "limit=0",
  "status=forged",
  "table=bad",
  "from=bad",
  "cursor=bad",
  "cursor=2026-10-18T00:00:00.1Z|bad",
])("rejects malformed filter %s", async (filter) => {
  vi.stubGlobal("fetch", upstream());
  expect(
    (await fetchRequest(req(`orders?tenant=${tenant}&${filter}`), env)).status,
  ).toBe(422);
});
it("scopes and bounds queries with safe cursor preserving microseconds", async () => {
  const mock = upstream();
  vi.stubGlobal("fetch", mock);
  const cursor = `2026-10-18T00:00:00.123456+00:00|${id}`;
  const r = await fetchRequest(
    req(
      `orders?tenant=${tenant}&status=history&limit=1&cursor=${encodeURIComponent(cursor)}`,
    ),
    env,
  );
  expect(r.status).toBe(200);
  const url = decodeURIComponent(
    String(mock.mock.calls.find((c) => String(c[0]).includes("/orders"))?.[0]),
  );
  expect(url).toContain(`tenant_id=eq.${tenant}`);
  expect(url).toContain("limit=2");
  expect(url).toContain(".123456+00:00");
  expect(url).not.toContain("guest_session_id");
});
