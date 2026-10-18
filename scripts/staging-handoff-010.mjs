import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

const dir = ".wrangler/staging-010-qnvsioxptgxrmoprlbbc/";
const secrets = JSON.parse(readFileSync(dir + "server-secrets.json", "utf8"));
const fixture = JSON.parse(readFileSync(dir + "demo-manifest.json", "utf8"));
const origin = "https://menuflow-web-staging.menuflow.workers.dev";
if (
  secrets.SUPABASE_URL !== "https://qnvsioxptgxrmoprlbbc.supabase.co" ||
  fixture.operator !== secrets.PLATFORM_ADMIN_USER_ID ||
  fixture.origin !== origin
)
  throw Error("Wrong staging target");
const db = createClient(
  secrets.SUPABASE_URL,
  secrets.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const r = await db.auth.admin.generateLink({
  type: "recovery",
  email: "admin@menuflow.com",
  options: { redirectTo: origin + "/activate" },
});
if (r.error || r.data.user.id !== fixture.operator)
  throw Error("Could not prepare the same staging operator");
// The bearer activation link remains only in this process's memory.
const activation =
  origin +
  "/activate#token_hash=" +
  r.data.properties.hashed_token +
  "&type=recovery";
const tiles = [];
for (const table of fixture.tables) {
  const png = await QRCode.toDataURL(origin + "/menu#" + table.qr, {
    width: 300,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  tiles.push(
    `<section><h2>MenuFlow Test Kafe — ${table.name}</h2><img alt="${table.name} QR" src="${png}"><p>Yalnız test içindir. Gerçek ödeme alınmaz.</p></section>`,
  );
}
const qrHtml = `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MenuFlow test masaları</title><style>body{font:18px system-ui;max-width:780px;margin:auto;padding:24px}section{break-inside:avoid;border-top:1px solid #ccc;padding:20px 0}img{max-width:100%}</style><h1>MenuFlow Test Kafe</h1><p>Telefon kamerasıyla QR'ı tara. Müşteri girişi veya e-posta doğrulaması gerekmez. Yalnız örnek veri kullan.</p>${tiles.join("")}</html>`;
writeFileSync(
  "C:/Users/Ekin Taner/Documents/Codex/2026-10-18/referenced-chatgpt-conversation-this-is-an-11/outputs/MenuFlow-test-QR.html",
  qrHtml,
);
const page = `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MenuFlow staging admin kurulumu</title><style>body{font:18px system-ui;max-width:780px;margin:5vh auto;padding:24px;color:#173c34;background:#f5f3ed}p{line-height:1.6}section{break-inside:avoid;border-top:1px solid #ccc;padding:20px 0}img{max-width:100%}a{color:#173c34}</style><h1>İnternet test ortamı hazır.</h1><p><a href="${activation}" target="_blank" rel="noreferrer">Staging admin parolamı kendim belirle</a> · Hesap: <strong>admin@menuflow.com</strong>. Bu ayrı test hesabıdır; bilgisayardaki yerel admin kimliğini/parolasını değiştirmez. Parolanı ve etkinleştirme bağlantısını sohbetle paylaşma.</p><p>Bağlantı tek kullanımlıktır ve bu ekran bir saat sonra kapanır.</p><p><a href="${origin}/login" target="_blank" rel="noreferrer">Ortak giriş</a> · <a href="${origin}/admin" target="_blank" rel="noreferrer">Restoran paneli</a> · <a href="/menu" target="_blank" rel="noreferrer">Örnek menü</a> · <a href="/qr">Yazdırılabilir QR'lar</a></p><p>Test ortamında gerçek ödeme veya müşteri bilgisi kullanma. QR taraması için müşteri hesabı gerekmez.</p>${tiles.join("")}</html>`;
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (req.headers.host !== "127.0.0.1:5211" || req.method !== "GET") {
    res.writeHead(403).end();
    return;
  }
  if (req.url === "/menu") {
    res
      .writeHead(302, { Location: origin + "/menu#" + fixture.tables[0].qr })
      .end();
    return;
  }
  if (req.url !== "/" && req.url !== "/qr") {
    res.writeHead(404).end();
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(req.url === "/qr" ? qrHtml : page);
});
server.on("error", () => {
  console.error("Local staging handoff could not bind port 5211.");
  process.exitCode = 1;
});
server.listen(5211, "127.0.0.1", () =>
  console.log(
    "Private staging activation and printable QR handoff: http://127.0.0.1:5211 . No password or bearer link logged.",
  ),
);
// Bound the synthetic ordering rehearsal; the static menu remains published.
async function closeRehearsal() {
  const result = await db
    .from("tenant_settings")
    .update({ ordering_enabled: false })
    .eq("tenant_id", fixture.tenant);
  if (result.error)
    console.error(
      "Could not confirm rehearsal order cutoff; close ordering in the staging dashboard.",
    );
  server.close();
}
setTimeout(() => void closeRehearsal(), 3600000).unref();
process.on("SIGINT", () => void closeRehearsal());
process.on("SIGTERM", () => void closeRehearsal());
