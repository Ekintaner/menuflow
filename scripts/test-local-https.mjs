import { request } from "node:https";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const ca = readFileSync(".wrangler/phone-010/ca.pem");
const origin = "https://127.0.0.1:5443";
function call(path, method = "GET", headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = request(
      origin + path,
      { ca, servername: "localhost", method, headers, timeout: 10000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(Error("timeout")));
    req.end(body);
  });
}
let guest;
try {
  assert.equal((await call("/login")).status, 200);
  assert.equal((await call("/api/v1/health")).status, 200);
  assert.equal((await call("/api/v1/platform/overview")).status, 401);
  assert.equal(
    (await call("/api/v1/health", "GET", { Host: "evil.test" })).status,
    403,
  );
  for (const headers of [
    {},
    { Origin: "https://evil.test" },
    {
      Origin: "https://evil.test",
      "X-Forwarded-Host": "127.0.0.1:5443",
      "X-Forwarded-Proto": "https",
    },
  ])
    assert.equal(
      (await call("/api/v1/guest-sessions", "POST", headers, "{}")).status,
      403,
    );
  assert.equal((await call("/_pilot/auth/v1/admin/users")).status, 404);
  assert.equal(
    (await call("/_pilot/storage/v1/object/sign/private/tenant/file?token=abc"))
      .status,
    404,
  );
  assert.equal((await call("/server-key.pem")).status, 404);
  const sample = JSON.parse(readFileSync(".wrangler/demo-008.json", "utf8"));
  const session = await call(
    "/api/v1/guest-sessions",
    "POST",
    { Origin: origin, "Content-Type": "application/json" },
    JSON.stringify({ token: sample.qr }),
  );
  assert.equal(session.status, 201);
  const setCookie = session.headers["set-cookie"][0];
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1"])
    assert.ok(setCookie.includes(flag));
  guest = setCookie.split(";")[0];
  const menu = await call("/api/v1/menu", "GET", { Cookie: guest });
  assert.equal(menu.status, 200);
  assert.ok(!menu.body.toString().includes("http://127.0.0.1:55431"));
  const images = JSON.parse(menu.body)
    .products.filter((p) => p.image_url)
    .map((p) => p.image_url);
  assert.ok(images.length > 0);
  for (const path of images) {
    assert.ok(path.startsWith("/_pilot/storage/v1/object/sign/menu-images/"));
    const img = await call(path);
    assert.equal(img.status, 200);
    assert.match(img.headers["content-type"], /^image\//);
    assert.equal(img.headers["cache-control"], "no-store");
  }
  console.log(
    "PASS: verified CA/hostname TLS, secure guest cookie, real menu/images, Host/Origin/spoofed header rejection, no broad Supabase proxy. No order placed.",
  );
} finally {
  if (guest) {
    const hash = createHash("sha256")
      .update(guest.slice("mf_guest=".length))
      .digest("hex");
    // Remove only this smoke test's exact guest token; preserve existing sample and financial records.
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_menuflow-local",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `delete from guest_sessions where session_hash='${hash}';`,
        encoding: "utf8",
      },
    );
    if (result.status !== 0) {
      console.error("Smoke session cleanup failed.");
      process.exitCode = 1;
    }
  }
}
