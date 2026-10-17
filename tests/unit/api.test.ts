import { describe, it, expect } from "vitest";
import { handleRequest } from "../../worker/index";
import { createUserDatabase } from "../../worker/supabase";
describe("API boundary", () => {
  it("answers health without database credentials", async () => {
    const r = handleRequest(new Request("https://example.test/api/v1/health"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok", service: "menuflow-api" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["/api/v1/orders", "/api/v1/admin/orders", "/api/v1/menu"])(
    "keeps unfinished endpoint closed: %s",
    async (path) => {
      const r = handleRequest(new Request(`https://example.test${path}`));
      expect(r.status).toBe(404);
      expect(await r.json()).toMatchObject({
        code: "NOT_FOUND",
        request_id: expect.any(String),
      });
    },
  );
  it("rejects health mutations", () =>
    expect(
      handleRequest(
        new Request("https://example.test/api/v1/health", { method: "POST" }),
      ).status,
    ).toBe(404));
  it("fails closed without database configuration", () =>
    expect(() => createUserDatabase({}, "token")).toThrow(
      "Database is not configured",
    ));
  it("requires a user token", () =>
    expect(() =>
      createUserDatabase(
        {
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "placeholder",
        },
        "",
      ),
    ).toThrow("User access token required"));
});
