import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Only this deliberately created staging project. Never read or overwrite .dev.vars.
const config = JSON.parse(
  readFileSync(".wrangler/staging-010-public.json", "utf8"),
);
if (
  config.project_ref !== "qnvsioxptgxrmoprlbbc" ||
  config.SUPABASE_URL !== "https://qnvsioxptgxrmoprlbbc.supabase.co"
)
  throw Error("Unexpected staging target.");
const origin = "http://127.0.0.1:5210";
const expires = Date.now() + 3600000;
const secretFile =
  ".wrangler/staging-010-qnvsioxptgxrmoprlbbc/server-secrets.json";
const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  // no-referrer turns a native form POST's Origin into null in Chromium.
  // Preserve same-origin form provenance; outbound links remain noreferrer.
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const page = (body) =>
  `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MenuFlow staging kurulumu</title><style>body{font:18px system-ui;max-width:680px;margin:8vh auto;padding:24px;color:#173c34;background:#f5f3ed}p{line-height:1.6}input,button{display:block;font:inherit;padding:14px;box-sizing:border-box;width:100%;margin:18px 0}button{color:white;background:#173c34;border:0}a{color:#173c34}</style>${body}</html>`;
const form = page(
  `<h1>MenuFlow internet testini bağla</h1><p>Yeni <strong>menuflow-staging</strong> projesinin sunucu anahtarını yalnız bu yerel ekrana yapıştır. Bu bir hesap parolası değildir. Sohbete gönderme.</p><p><a href="https://supabase.com/dashboard/project/qnvsioxptgxrmoprlbbc/settings/api-keys" target="_blank" rel="noreferrer">Supabase proje anahtarlarını aç</a>. Secret key veya eski service_role anahtarını kullan. Anahtar yalnız bu projenin HTTPS API’sinde doğrulanır ve bilgisayarda Git dışında, erişimi kısıtlı dosyada saklanır. Sonraki adımda yalnız MenuFlow staging Worker secret’ına yüklenecek.</p><form method="POST" action="/save"><label for="key">Staging sunucu secret anahtarı</label><input id="key" name="key" type="password" autocomplete="off" required maxlength="4096"><button>Güvenle kaydet</button></form><p>Yerel hesap, mevcut admin kimliği ve diğer projeler değiştirilmez. Ekran bir saat sonra kapanır.</p>`,
);
const saved = page(
  "<h1>Kaydedildi.</h1><p>Anahtar doğrulandı ve yalnız bu bilgisayarda güvenle saklandı. Sohbete yalnız “anahtarı kaydettim” yazabilirsin. Bu sayfa artık kapanabilir.</p>",
);
const results = {
  invalid: "Anahtar alanını kontrol edip tekrar dene.",
  rejected:
    "Bu proje için sunucu anahtarı doğrulanamadı. menuflow-staging projesindeki Secret veya service_role anahtarını kullan.",
  failed:
    "Anahtar doğrulanamadı veya kaydedilemedi. Tekrar deneyebilir ya da anahtarı paylaşmadan durumu bildirebilirsin.",
};
function redirectResult(res, state) {
  // POST/redirect/GET clears the submitted key from the page and avoids resubmission.
  res.writeHead(303, { Location: `/result?state=${state}` }).end();
}
const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (req.headers.host !== "127.0.0.1:5210") {
    res.writeHead(403).end();
    return;
  }
  if (Date.now() > expires) {
    res.writeHead(410).end(page("<p>Kurulum süresi doldu.</p>"));
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    res.end(existsSync(secretFile) ? saved : form);
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/result?state=")) {
    const state = new URL(req.url, origin).searchParams.get("state");
    if (state === "saved" && existsSync(secretFile)) res.end(saved);
    else if (Object.hasOwn(results, state))
      res.end(
        page(
          `<h1>Kurulum tamamlanmadı.</h1><p>${results[state]}</p><a href="/">Kurulum ekranına dön</a>`,
        ),
      );
    else res.writeHead(404).end();
    return;
  }
  if (req.method !== "POST" || req.url !== "/save") {
    res.writeHead(404).end();
    return;
  }
  if (
    req.headers.origin !== origin ||
    req.headers["content-type"]?.split(";")[0] !==
      "application/x-www-form-urlencoded"
  ) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(secretFile)) {
    redirectResult(res, "saved");
    return;
  }
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    const key = params.get("key")?.trim() ?? "";
    if (
      [...params.keys()].join(",") !== "key" ||
      key.length < 30 ||
      key.length > 4096 ||
      !/^[A-Za-z0-9_.-]+$/.test(key)
    ) {
      redirectResult(res, "invalid");
      return;
    }
    const db = createClient(config.SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(12000) }),
      },
    });
    const { error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
      redirectResult(res, "rejected");
      return;
    }
    writeFileSync(
      secretFile,
      JSON.stringify({
        SUPABASE_URL: config.SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: config.SUPABASE_PUBLISHABLE_KEY,
        SUPABASE_SERVICE_ROLE_KEY: key,
      }),
      { mode: 0o600, flag: "wx" },
    );
    redirectResult(res, "saved");
  } catch {
    redirectResult(res, "failed");
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.on("error", () => {
  console.error("Local staging setup could not start.");
  process.exitCode = 1;
});
server.listen(5210, "127.0.0.1", () =>
  console.log(
    "Staging secret entry: http://127.0.0.1:5210 . No credentials are logged.",
  ),
);
setTimeout(() => server.close(), 3600000).unref();
