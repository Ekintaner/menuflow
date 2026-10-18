import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";

// This helper only provisions the dedicated local MenuFlow stack. Cloud setup
// must use the documented operator procedure, never this convenience script.
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw Error("Usage: node scripts/bootstrap-admin.mjs <your-email>");
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["supabase", "status", "-o", "json"],
  { encoding: "utf8", shell: process.platform === "win32" },
);
if (result.status !== 0)
  throw Error("Start the dedicated local Supabase stack first.");
const config = JSON.parse(result.stdout);
if (config.API_URL !== "http://127.0.0.1:55431")
  throw Error("Refusing anything other than the dedicated loopback instance.");
const db = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let type = "invite";
let invite = await db.auth.admin.generateLink({ type, email });
if (
  invite.error &&
  ["email_exists", "user_already_exists"].includes(invite.error.code)
) {
  type = "recovery";
  invite = await db.auth.admin.generateLink({ type, email });
}
if (invite.error || !invite.data.user || !invite.data.properties?.hashed_token)
  throw Error(
    "Local invitation could not be created. No credentials were printed.",
  );
let vars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf8") : "";
const existing = vars.match(
  /^PLATFORM_ADMIN_USER_ID\s*=\s*["']?([a-f0-9-]{36})/m,
)?.[1];
if (existing && existing !== invite.data.user.id)
  throw Error(
    "A different administrator UUID is already configured; review it manually.",
  );
for (const [key, value] of Object.entries({
  SUPABASE_URL: config.API_URL,
  SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY,
  PLATFORM_ADMIN_USER_ID: invite.data.user.id,
})) {
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}\\s*=.*$`, "m");
  vars = pattern.test(vars)
    ? vars.replace(pattern, () => line)
    : vars.trimEnd() + "\n" + line + "\n";
}
writeFileSync(".dev.vars", vars, { mode: 0o600 });
const activation = `http://127.0.0.1:5198/activate#token_hash=${invite.data.properties.hashed_token}&type=${type}`;
// The bearer link exists only in memory. No password, link or JWT is logged.
const expires = Date.now() + 60 * 60 * 1000;
const server = createServer((req, res) => {
  if (req.headers.host !== "127.0.0.1:5208" || req.method !== "GET") {
    res.writeHead(403).end();
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/menu" && existsSync(".wrangler/demo-008.json")) {
    const sample = JSON.parse(readFileSync(".wrangler/demo-008.json", "utf8"));
    res
      .writeHead(302, { Location: `http://127.0.0.1:5198/menu#${sample.qr}` })
      .end();
    return;
  }
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (Date.now() > expires) {
    res
      .writeHead(410)
      .end(
        "Kurulum bağlantısının süresi doldu. Yerel kurulum aracını yeniden çalıştırın.",
      );
    return;
  }
  res.end(
    `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MenuFlow yönetici kurulumu</title><style>body{font:18px system-ui;max-width:600px;margin:12vh auto;padding:24px;color:#173c34;background:#f5f3ed}h1{font:40px Georgia}a{display:inline-block;padding:16px 24px;background:#173c34;color:white;text-decoration:none;margin:20px 0}p{line-height:1.6}</style><h1>Yönetici hesabını tamamla.</h1><p>Bu işlem yalnız bu bilgisayardaki örnek MenuFlow içindir. Sonraki ekranda parolanı kendin belirle; sohbetle paylaşma.</p><a href="${activation}" rel="noreferrer">Parolamı güvenle belirle</a><p>Ardından ortak giriş ekranından yönetici hesabınla giriş yapabilirsin. Bağlantı tek kullanımlıktır.</p></html>`,
  );
});
server.listen(5208, "127.0.0.1", () =>
  console.log(
    "Local administrator ready. Restart the API, then open http://127.0.0.1:5208 . No email was sent.",
  ),
);
setTimeout(() => server.close(), 60 * 60 * 1000).unref();
