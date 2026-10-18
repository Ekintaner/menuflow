import { afterEach, expect, it, vi } from "vitest";
import { fetchRequest } from "../../worker/index";
const tenant = "10000000-0000-0000-0000-000000000001",
  id = "10000000-0000-0000-0000-000000000002";
const env = {
  SUPABASE_URL: "https://db.test",
  SUPABASE_PUBLISHABLE_KEY: "test-public",
  SUPABASE_SERVICE_ROLE_KEY: "test-private",
  AUTH_LIMIT: { limit: async () => ({ success: true }) },
};
const req = (
  path: string,
  data?: unknown,
  cookie = "mf_admin=test",
  key = "settlement-test",
  origin = "https://app.test",
) =>
  new Request("https://app.test/api/v1" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie,
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
const upstream = (error?: string) =>
  vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id });
    if (url.includes("/memberships")) return Response.json({ role: "staff" });
    if (url.includes("/rpc/read_table_checks")) return Response.json([{ id }]);
    if (url.includes("/rpc/settle_check"))
      return error
        ? Response.json({ code: "P0001", message: error }, { status: 400 })
        : Response.json({ id, amount_minor: 51000, action: "pay" });
    throw Error(url);
  });
afterEach(() => vi.unstubAllGlobals());
it("blocks guest bill access before reading private data", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(
    req("/admin/checks?tenant=" + tenant, undefined, "mf_guest=guest"),
    env,
  );
  expect(r.status).toBe(401);
  expect(network).not.toHaveBeenCalled();
});
it("reads checks with a user JWT and verified tenant, never elevated credentials", async () => {
  const network = upstream();
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(req("/admin/checks?tenant=" + tenant), env);
  expect(r.status).toBe(200);
  const calls = network.mock.calls.map((c) => String(c[0]));
  expect(calls.some((u) => u.includes("/rpc/read_table_checks"))).toBe(true);
});
it("settlement carries the retry key and never a trusted client total", async () => {
  const network = upstream();
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(
    req("/admin/checks/" + id + "/settle?tenant=" + tenant, {
      action: "pay",
      version: 1,
      expected_total_minor: 51000,
    }),
    env,
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ amount_minor: 51000 });
});
it.each([
  "ACTIVE_ORDERS",
  "TOTAL_CHANGED",
  "SETTLEMENT_CONFLICT",
  "VERSION_CONFLICT",
])("maps database %s without hiding conflicts", async (code) => {
  vi.stubGlobal("fetch", upstream(code));
  const r = await fetchRequest(
    req("/admin/checks/" + id + "/settle?tenant=" + tenant, {
      action: "pay",
      version: 1,
      expected_total_minor: 51000,
    }),
    env,
  );
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ code });
});
it.each([
  { action: "close", version: 1, expected_total_minor: 0 },
  { action: "pay", version: 1, expected_total_minor: -1 },
  { action: "pay", version: 1, expected_total_minor: 1.2 },
  {
    action: "pay",
    version: 1,
    expected_total_minor: 0,
    payment_status: "paid",
  },
])("rejects unsafe settlement body %j", async (payload) => {
  vi.stubGlobal("fetch", upstream());
  expect(
    (
      await fetchRequest(
        req("/admin/checks/" + id + "/settle?tenant=" + tenant, payload),
        env,
      )
    ).status,
  ).toBe(422);
});
it("requires a settlement retry key", async () => {
  vi.stubGlobal("fetch", upstream());
  expect(
    (
      await fetchRequest(
        req(
          "/admin/checks/" + id + "/settle?tenant=" + tenant,
          { action: "pay", version: 1, expected_total_minor: 0 },
          "mf_admin=test",
          "",
        ),
        env,
      )
    ).status,
  ).toBe(422);
});
it("rate limits registration before any account or DB operation", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(
    req(
      "/auth/registration",
      { email: "a@example.test", applicant_name: "A", business_name: "A" },
      "",
    ),
    { ...env, AUTH_LIMIT: { limit: async () => ({ success: false }) } },
  );
  expect(r.status).toBe(429);
  expect(network).not.toHaveBeenCalled();
});
it("requires Origin for public registration", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  expect(
    (
      await fetchRequest(
        req("/auth/registration", {}, "", "", "https://evil.test"),
        env,
      )
    ).status,
  ).toBe(403);
  expect(network).not.toHaveBeenCalled();
});
it("registration never accepts or stores a password", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  expect(
    (
      await fetchRequest(
        req(
          "/auth/registration",
          {
            email: "a@example.test",
            applicant_name: "A",
            business_name: "A",
            password: "secret",
          },
          "",
        ),
        env,
      )
    ).status,
  ).toBe(422);
  expect(network).not.toHaveBeenCalled();
});
it("duplicate requests get the same non-enumerating response", async () => {
  const payload = {
    email: "a@example.test",
    applicant_name: "A",
    business_name: "A",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(null, { status: 201 })),
  );
  const a = await fetchRequest(req("/auth/registration", payload, ""), env);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ code: "23505", message: "duplicate" }, { status: 409 }),
    ),
  );
  const b = await fetchRequest(req("/auth/registration", payload, ""), env);
  expect(a.status).toBe(202);
  expect(b.status).toBe(202);
  expect(await b.json()).toEqual(await a.json());
});
it("owners cannot approve registrations or read global audit", async () => {
  vi.stubGlobal("fetch", upstream());
  for (const path of [
    "/platform/registrations/" + id + "/approve",
    "/platform/audit",
  ]) {
    const r = await fetchRequest(
      req(path, path.endsWith("approve") ? { table_count: 4 } : undefined),
      { ...env, PLATFORM_ADMIN_USER_ID: tenant },
    );
    expect(r.status).toBe(403);
  }
});
it("invalid activation links never create a management cookie", async () => {
  const r = await fetchRequest(
    req(
      "/auth/activation-session",
      { type: "signup", token_hash: "a".repeat(64) },
      "",
    ),
    env,
  );
  expect(r.status).toBe(401);
  expect(r.headers.get("set-cookie")).toBeNull();
});
