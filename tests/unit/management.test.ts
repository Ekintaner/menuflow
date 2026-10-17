import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRequest } from "../../worker/index";
import { hash, randomToken } from "../../worker/management";
const tenant = "10000000-0000-0000-0000-000000000001";
const id = "10000000-0000-0000-0000-000000000002";
const env = {
  SUPABASE_URL: "https://db.test",
  SUPABASE_PUBLISHABLE_KEY: "public-test",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test",
};
function request(
  path: string,
  data?: unknown,
  method = "POST",
  origin = "https://app.test",
) {
  return new Request(`https://app.test/api/v1${path}`, {
    method: data === undefined ? "GET" : method,
    headers: {
      origin,
      cookie: "mf_admin=test-jwt",
      "content-type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
function upstream(role = "owner") {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.includes("/auth/v1/user"))
      return Response.json({ id, user_metadata: { role: "owner" } });
    if (url.includes("/rest/v1/memberships") && url.includes("tenants"))
      return Response.json(role === "none" ? [] : [{ tenant_id: tenant }]);
    if (url.includes("/rest/v1/memberships"))
      return Response.json(role === "none" ? null : { role });
    if (url.includes("/rpc/rotate_table_qr")) return Response.json(null);
    if (url.includes("/rpc/read_qr_menu"))
      return Response.json({
        tenant: { name: "A", currency: "TRY" },
        table: { name: "Masa 1" },
        products: [{ name: "Kahve", price_minor: 12345 }],
        categories: [],
      });
    if (
      url.includes("/rest/v1/products") ||
      url.includes("/rest/v1/categories")
    )
      return Response.json({ id });
    if (url.includes("/auth/v1/token"))
      return Response.json({
        access_token: "test-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "never-return-this",
        user: { id },
      });
    throw new Error(`Unexpected upstream ${url}`);
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("CODEX-003 API", () => {
  it("requires authenticated cookie", async () => {
    const r = await fetchRequest(
      new Request("https://app.test/api/v1/admin/categories"),
      env,
    );
    expect(r.status).toBe(401);
  });
  it("rejects forged Origin before upstream access", async () => {
    const mock = upstream();
    vi.stubGlobal("fetch", mock);
    const r = await fetchRequest(
      request(
        `/admin/categories?tenant=${tenant}`,
        { name: "X" },
        "POST",
        "https://evil.test",
      ),
      env,
    );
    expect(r.status).toBe(403);
    expect(mock).not.toHaveBeenCalled();
  });
  it("fails closed when configuration is absent", async () => {
    expect(
      (
        await fetchRequest(
          request("/auth/login", { email: "a@b.test", password: "pass" }),
          {},
        )
      ).status,
    ).toBe(503);
  });
  it("returns only HttpOnly login cookie, never refresh/access token JSON", async () => {
    vi.stubGlobal("fetch", upstream());
    const r = await fetchRequest(
      request("/auth/login", { email: "a@b.test", password: "pass" }),
      env,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect(r.headers.get("set-cookie")).toContain("Secure");
    expect(await r.json()).toEqual({
      authenticated: true,
      destination: "/admin",
    });
  });
  it.each(["staff", "none"])(
    "blocks writes for %s regardless of editable metadata",
    async (role) => {
      vi.stubGlobal("fetch", upstream(role));
      const r = await fetchRequest(
        request(`/admin/categories?tenant=${tenant}`, { name: "X" }),
        env,
      );
      expect(r.status).toBe(403);
    },
  );
  it.each([-1, 1.5, "100", 2147483648])(
    "rejects invalid price %s",
    async (price) => {
      vi.stubGlobal("fetch", upstream());
      const r = await fetchRequest(
        request(`/admin/products?tenant=${tenant}`, {
          name: "X",
          category_id: id,
          price_minor: price,
        }),
        env,
      );
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({ code: "INVALID_PRICE" });
    },
  );
  it("rejects mass assignment", async () => {
    vi.stubGlobal("fetch", upstream());
    expect(
      (
        await fetchRequest(
          request(`/admin/categories?tenant=${tenant}`, {
            name: "X",
            tenant_id: id,
          }),
          env,
        )
      ).status,
    ).toBe(422);
  });
  it("preserves user JWT and tenant scope for writes", async () => {
    const mock = upstream();
    vi.stubGlobal("fetch", mock);
    expect(
      (
        await fetchRequest(
          request(
            `/admin/products/${id}?tenant=${tenant}`,
            { price_minor: 101 },
            "PATCH",
          ),
          env,
        )
      ).status,
    ).toBe(200);
    const call = mock.mock.calls.find(([u]) =>
      String(u).includes("/rest/v1/products"),
    );
    expect(String(call?.[0])).toContain(`tenant_id=eq.${tenant}`);
    expect(new Headers(call?.[1]?.headers).get("authorization")).toBe(
      "Bearer test-jwt",
    );
    expect(call?.[1]?.body).toBe('{"price_minor":101}');
  });
  it("rotates with hash only and returns fragment QR", async () => {
    const mock = upstream();
    vi.stubGlobal("fetch", mock);
    const r = await fetchRequest(
      request(`/admin/tables/${id}/qr?tenant=${tenant}`, {}),
      env,
    );
    expect(r.status).toBe(200);
    const { url } = await r.json();
    expect(url).toMatch(/^https:\/\/app.test\/menu#[a-f0-9]{64}$/);
    const call = mock.mock.calls.find(([u]) =>
      String(u).includes("/rpc/rotate_table_qr"),
    );
    expect(JSON.parse(String(call?.[1]?.body)).supplied_hash).toBe(
      await hash(url.split("#")[1]),
    );
  });
  it("reads menu only through narrow hash RPC", async () => {
    const mock = upstream();
    vi.stubGlobal("fetch", mock);
    const token = randomToken();
    const r = await fetchRequest(
      request("/menu", { token, tenant_id: "forged" }),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ tenant: { name: "A" } });
    expect(r.headers.get("set-cookie")).toContain("mf_menu=");
    expect(
      mock.mock.calls.some(([u]) => String(u).includes("/rest/v1/products")),
    ).toBe(false);
  });
  it("rejects missing QR", async () => {
    expect(
      (await fetchRequest(new Request("https://app.test/api/v1/menu"), env))
        .status,
    ).toBe(401);
  });
  it("rate limits before login upstream", async () => {
    const mock = upstream();
    vi.stubGlobal("fetch", mock);
    const r = await fetchRequest(
      request("/auth/login", { email: "a@b.test", password: "pass" }),
      { ...env, AUTH_LIMIT: { limit: async () => ({ success: false }) } },
    );
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
    expect(mock).not.toHaveBeenCalled();
  });
  it("rejects SVG image uploads", async () => {
    vi.stubGlobal("fetch", upstream());
    const r = await fetchRequest(
      new Request(
        `https://app.test/api/v1/admin/products/${id}/image?tenant=${tenant}`,
        {
          method: "POST",
          headers: {
            origin: "https://app.test",
            cookie: "mf_admin=test-jwt",
            "content-type": "image/svg+xml",
          },
          body: "<svg><script>alert(1)</script></svg>",
        },
      ),
      env,
    );
    expect(r.status).toBe(422);
  });
  it("requires a guest session for orders", async () => {
    expect(
      (await fetchRequest(request("/orders", { total_minor: 1 }), env)).status,
    ).toBe(401);
  });
});

it("routes the configured platform admin without trusting a role request", async () => {
  vi.stubGlobal("fetch", upstream("none"));
  const r = await fetchRequest(
    request("/auth/login", {
      email: "a@b.test",
      password: "pass",
      role: "owner",
    }),
    { ...env, PLATFORM_ADMIN_USER_ID: id },
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    authenticated: true,
    destination: "/platform",
  });
});
it("refuses login and session access without an active granted membership", async () => {
  vi.stubGlobal("fetch", upstream("none"));
  for (const req of [
    request("/auth/login", {
      email: "a@b.test",
      password: "pass",
      role: "platform_admin",
    }),
    request("/auth/session"),
  ]) {
    const r = await fetchRequest(req, env);
    expect(r.status).toBe(403);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.json()).toMatchObject({ code: "MEMBERSHIP_REQUIRED" });
  }
});
it.each(["POST", "PATCH", "DELETE"])(
  "prevents restaurant owner membership writes using %s",
  async (method) => {
    vi.stubGlobal("fetch", upstream());
    const r = await fetchRequest(
      request(
        `/admin/staff/${id}?tenant=${tenant}`,
        { user_id: id, active: true },
        method,
      ),
      env,
    );
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "PLATFORM_REQUIRED" });
  },
);
