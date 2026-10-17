import { afterEach, expect, it, vi } from "vitest";
import { fetchRequest } from "../../worker/index";
const operator = "00000000-0000-0000-0000-000000000001";
const env = {
  SUPABASE_URL: "https://db.test",
  SUPABASE_PUBLISHABLE_KEY: "test-public",
  SUPABASE_SERVICE_ROLE_KEY: "test-server",
  PLATFORM_ADMIN_USER_ID: operator,
};
afterEach(() => vi.unstubAllGlobals());
it("platform stays closed until a single operator UUID is configured", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(
    new Request("https://app.test/api/v1/platform/restaurants"),
    {},
  );
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({ code: "PLATFORM_DISABLED" });
  expect(network).not.toHaveBeenCalled();
});
it("tenant roles and editable metadata cannot grant platform access", async () => {
  const network = vi.fn(async () =>
    Response.json({
      id: "00000000-0000-0000-0000-000000000002",
      role: "authenticated",
      app_metadata: { role: "owner" },
      user_metadata: { platform_admin: true },
    }),
  );
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(
    new Request("https://app.test/api/v1/platform/restaurants", {
      headers: { cookie: "mf_admin=token" },
    }),
    env,
  );
  expect(r.status).toBe(403);
  expect(await r.json()).toMatchObject({ code: "PLATFORM_FORBIDDEN" });
  expect(network).toHaveBeenCalledTimes(1);
  expect(String(network.mock.calls[0])).not.toContain("service_role");
});
it("platform writes require the same origin before privileged access", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  const r = await fetchRequest(
    new Request("https://app.test/api/v1/platform/restaurants", {
      method: "POST",
      headers: { origin: "https://evil.test", cookie: "mf_admin=token" },
    }),
    env,
  );
  expect(r.status).toBe(403);
  expect(network).not.toHaveBeenCalled();
});
