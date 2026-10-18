import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { isIP } from "node:net";
import { execFileSync } from "node:child_process";
import { createServer as createViteServer } from "vite";
import {
  localEnv,
  signedImagePath,
  rewriteImages,
} from "./phone-pilot-lib.mjs";

const { values } = parseArgs({
  options: {
    host: { type: "string", default: "127.0.0.1" },
    phone: { type: "string" },
    "ports-blocked-on-phone": { type: "boolean", default: false },
  },
});
const host = values.host;
if (
  isIP(host) !== 4 ||
  (host !== "127.0.0.1" &&
    !/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host))
)
  throw Error("Private IPv4 only.");
if (host !== "127.0.0.1") {
  if (
    !values["ports-blocked-on-phone"] ||
    isIP(values.phone ?? "") !== 4 ||
    values.phone === host ||
    !/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(values.phone)
  )
    throw Error(
      "Confirm both blocked ports on the real phone and supply its private IPv4 first.",
    );
  if (process.platform !== "win32")
    throw Error("Windows firewall verification required.");
  // Read the effective rule, including its adapter scope; never change firewall policy here.
  const check = `$ErrorActionPreference='Stop'; $r=Get-NetFirewallRule -PolicyStore ActiveStore -Name 'MenuFlow-Local-Supabase-Block-LAN'; $p=$r|Get-NetFirewallPortFilter; $i=$r|Get-NetFirewallInterfaceFilter; $a=(Get-NetIPAddress -IPAddress '${host}').InterfaceAlias; if($r.Enabled -ne 'True' -or $r.Action -ne 'Block' -or $r.Direction -ne 'Inbound' -or $r.Profile -ne 'Any' -or $p.Protocol -ne 'TCP' -or '55431' -notin $p.LocalPort -or '55432' -notin $p.LocalPort -or ($i.InterfaceAlias -notcontains 'Any' -and $i.InterfaceAlias -notcontains $a) -or (Get-NetFirewallProfile|Where-Object Enabled -eq $false)){exit 1}`;
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", check],
    { stdio: "pipe" },
  );
}
const env = localEnv();
const origin = `https://${host}:5443`;
const certDir = ".wrangler/phone-010/";
const root = resolve("dist");
readFileSync(resolve(root, "index.html")); // Require the reviewed production build.
// Load the exact application handlers; this is a local Node adapter, not a cloud runtime capacity test.
const vite = await createViteServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
const { fetchRequest } = await vite.ssrLoadModule("/worker/index.ts");
const allowed = new Set(["127.0.0.1", host, values.phone].filter(Boolean));
const security = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const server = createServer(
  {
    key: readFileSync(certDir + "server-key.pem"),
    cert: readFileSync(certDir + "server.pem"),
    minVersion: "TLSv1.2",
  },
  async (req, res) => {
    for (const [k, v] of Object.entries(security)) res.setHeader(k, v);
    try {
      if (
        !allowed.has(req.socket.remoteAddress) ||
        req.headers.host !== `${host}:5443` ||
        !req.url?.startsWith("/") ||
        req.url.startsWith("//")
      ) {
        res.writeHead(403).end();
        return;
      }
      const url = new URL(req.url, origin);
      if (
        req.method !== "GET" &&
        req.method !== "HEAD" &&
        req.headers.origin !== origin
      ) {
        res.writeHead(403).end();
        return;
      }
      if (url.pathname.startsWith("/_pilot/")) {
        const image = signedImagePath(
          "http://127.0.0.1:55431" + req.url.slice("/_pilot".length),
        );
        if (req.method !== "GET" || !image) {
          res.writeHead(404).end();
          return;
        }
        // Fixed destination, signed object GET only; no cookies, auth headers, redirects or arbitrary URLs.
        const upstream = await fetch("http://127.0.0.1:55431" + image, {
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        const type = upstream.headers.get("content-type")?.split(";")[0];
        if (
          !upstream.ok ||
          !["image/png", "image/jpeg", "image/webp"].includes(type)
        ) {
          res.writeHead(404).end();
          return;
        }
        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (bytes.length > 307200) {
          res.writeHead(413).end();
          return;
        }
        res.setHeader("Content-Type", type);
        res.end(bytes);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 512000) {
            res.writeHead(413).end();
            return;
          }
          chunks.push(chunk);
        }
        const headers = new Headers();
        for (const name of [
          "origin",
          "cookie",
          "content-type",
          "idempotency-key",
        ])
          if (req.headers[name]) headers.set(name, req.headers[name]);
        // Ignore all forwarded Host/Proto/IP headers from the browser.
        const response = await fetchRequest(
          new Request(url, {
            method: req.method,
            headers,
            ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
          }),
          env,
        );
        res.statusCode = response.status;
        for (const [k, v] of response.headers)
          if (k !== "set-cookie") res.setHeader(k, v);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader("Set-Cookie", cookies);
        if (response.headers.get("content-type")?.includes("application/json"))
          res.end(JSON.stringify(rewriteImages(await response.json())));
        else res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (!["GET", "HEAD"].includes(req.method) || url.search) {
        res.writeHead(404).end();
        return;
      }
      let file = resolve(root, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + sep)) {
        res.writeHead(404).end();
        return;
      }
      if (
        [
          "/",
          "/login",
          "/activate",
          "/register",
          "/menu",
          "/admin",
          "/platform",
        ].includes(url.pathname)
      )
        file = resolve(root, "index.html");
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
      };
      if (!types[extname(file)]) {
        res.writeHead(404).end();
        return;
      }
      const bytes = readFileSync(file);
      res.setHeader("Content-Type", types[extname(file)]);
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch {
      if (!res.headersSent) res.writeHead(503);
      res.end();
    }
  },
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.on("error", async () => {
  console.error("Pilot listener failed; check port/certificate.");
  await vite.close();
  process.exitCode = 1;
});
server.listen(5443, host, () =>
  console.log(
    `MenuFlow synthetic HTTPS rehearsal: ${origin} . Expires in 60 minutes. No request logging.`,
  ),
);
async function stop() {
  server.closeAllConnections();
  server.close();
  await vite.close();
}
setTimeout(stop, 3600000).unref();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
