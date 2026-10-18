import { expect, it, vi } from "vitest";
import web from "../../worker/staging-web";

it("preserves the original HTTPS request, Origin and response cookies through the alternate web host", async () => {
  const request = new Request("https://staging.test/api/v1/orders", {
    method: "POST",
    headers: { Origin: "https://staging.test", Cookie: "mf_guest=synthetic" },
    body: "{}",
  });
  const response = new Response("ok", {
    headers: { "Set-Cookie": "mf_guest=synthetic; Secure; HttpOnly" },
  });
  const service = {
    fetch: vi.fn(async (r: Request) => {
      expect(r).toBe(request);
      return response;
    }),
  };
  const assets = { fetch: vi.fn() };
  expect(
    await web.fetch(request, { MENUFLOW_API: service, ASSETS: assets }),
  ).toBe(response);
  expect(assets.fetch).not.toHaveBeenCalled();
});
it("never falls back to SPA assets for an API binding failure", async () => {
  const assets = { fetch: vi.fn() };
  const response = await web.fetch(
    new Request("https://staging.test/api/missing"),
    { ASSETS: assets },
  );
  expect(response.status).toBe(503);
  expect(assets.fetch).not.toHaveBeenCalled();
});
it("serves frontend routes only through the assets binding", async () => {
  const response = new Response("frontend");
  const assets = { fetch: vi.fn(async () => response) };
  expect(
    await web.fetch(new Request("https://staging.test/login"), {
      ASSETS: assets,
    }),
  ).toBe(response);
});
