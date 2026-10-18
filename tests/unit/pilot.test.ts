import { afterEach, expect, it, vi } from "vitest";
import { fetchRequest, type Env } from "../../worker/index";
import { onRequest } from "../../functions/api/[[path]]";
const limiter = { limit: async () => ({ success: true }) };
const env: Env = {
  DEPLOYMENT_ENV: "pilot",
  ORDERING_DISABLED: "true",
  SUPABASE_URL: "https://db.test",
  SUPABASE_PUBLISHABLE_KEY: "test-public",
  SUPABASE_SERVICE_ROLE_KEY: "test-server",
  AUTH_LIMIT: limiter,
  MENU_LIMIT: limiter,
  ORDER_LIMIT: limiter,
};
afterEach(() => vi.unstubAllGlobals());
it("rejects real registration intake on staging without contacting the database", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(
    new Request("https://app.test/api/v1/auth/registration", {
      method: "POST",
      headers: { Origin: "https://app.test" },
      body: "{}",
    }),
    { ...env, DEPLOYMENT_ENV: "staging" },
  );
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({ code: "STAGING_ONLY" });
  expect(network).not.toHaveBeenCalled();
});
it("stops new orders before any database side effect", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(
    new Request("https://app.test/api/v1/orders", { method: "POST" }),
    env,
  );
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({ code: "ORDERING_PAUSED" });
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(network).not.toHaveBeenCalled();
});
it.each([
  "AUTH_LIMIT",
  "MENU_LIMIT",
  "ORDER_LIMIT",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ORDERING_DISABLED",
] as const)("fails closed when cloud binding %s is missing", async (key) => {
  const r = await fetchRequest(
    new Request("https://app.test/api/v1/admin/orders"),
    { ...env, [key]: undefined },
  );
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({ code: "NOT_CONFIGURED" });
});
it.each([
  { DEPLOYMENT_ENV: "production" },
  { SUPABASE_URL: "http://db.test" },
  { ORDERING_DISABLED: "FALSE" },
])("rejects unsafe cloud configuration %j", async (override) => {
  const r = await fetchRequest(new Request("https://app.test/api/v1/menu"), {
    ...env,
    ...override,
  });
  expect(r.status).toBe(503);
});
it("keeps tracking and admin available while new orders are paused", async () => {
  for (const path of [
    "/orders/40000000-0000-0000-0000-000000000001",
    "/admin/orders",
  ]) {
    const r = await fetchRequest(
      new Request(`https://app.test/api/v1${path}`),
      env,
    );
    expect(r.status).toBe(401);
    expect(await r.json()).not.toMatchObject({ code: "ORDERING_PAUSED" });
  }
});
it("explicit false permits order validation to run", async () => {
  const r = await fetchRequest(
    new Request("https://app.test/api/v1/orders", { method: "POST" }),
    { ...env, ORDERING_DISABLED: "false" },
  );
  expect(r.status).toBe(403); // Missing Origin, rather than bypassing CSRF protection.
});
it("Pages forwards the original origin, body and cookies and preserves response headers", async () => {
  const request = new Request("https://pilot.test/api/v1/orders?x=1", {
    method: "POST",
    headers: {
      Origin: "https://pilot.test",
      Cookie: "mf_guest=test",
      "Idempotency-Key": "same-attempt",
    },
    body: "{}",
  });
  const response = new Response("ok", {
    status: 201,
    headers: {
      "Set-Cookie": "mf_guest=next; HttpOnly; Secure",
      "X-Request-Id": "test-id",
    },
  });
  const binding = {
    fetch: vi.fn(async (r: Request) => {
      expect(r).toBe(request);
      expect(await r.text()).toBe("{}");
      expect(r.headers.get("origin")).toBe("https://pilot.test");
      expect(r.headers.get("cookie")).toBe("mf_guest=test");
      expect(r.headers.get("idempotency-key")).toBe("same-attempt");
      return response;
    }),
  };
  expect(await onRequest({ request, env: { MENUFLOW_API: binding } })).toBe(
    response,
  );
});
it.each([
  {},
  {
    MENUFLOW_API: {
      fetch: async () => {
        throw new Error("private upstream detail");
      },
    },
  },
])("Pages fails closed without a working binding", async (proxyEnv) => {
  const r = await onRequest({
    request: new Request("https://pilot.test/api/v1/menu"),
    env: proxyEnv,
  });
  expect(r.status).toBe(503);
  expect(r.headers.get("cache-control")).toBe("no-store");
  const body = await r.text();
  expect(body).not.toContain("private upstream detail");
  expect(body).toContain("SERVICE_UNAVAILABLE");
});
