import { createServer } from "node:http";
import { readFileSync } from "node:fs";

// Reuse the existing fictional QR without issuing an administrator recovery link.
// This helper neither connects to Supabase nor modifies the sample manifest.
const origin = "http://127.0.0.1:5198";
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (req.headers.host !== "127.0.0.1:5208" || req.method !== "GET") {
    res.writeHead(403).end();
    return;
  }
  if (req.url !== "/menu") {
    res.writeHead(404).end("Open /menu for the existing local sample.");
    return;
  }
  try {
    const sample = JSON.parse(readFileSync(".wrangler/demo-008.json", "utf8"));
    if (!/^[a-f0-9]{64}$/.test(sample.qr)) throw Error("Invalid sample");
    res.writeHead(302, { Location: `${origin}/menu#${sample.qr}` }).end();
  } catch {
    res
      .writeHead(503)
      .end(
        "Existing local sample unavailable. No data was created or changed.",
      );
  }
});
server.on("error", () => {
  console.error(
    "Local menu shortcut could not bind loopback port 5208. Check the existing helper.",
  );
  process.exitCode = 1;
});
server.listen(5208, "127.0.0.1", () => {
  console.log(
    "Existing local sample: http://127.0.0.1:5208/menu . No administrator link issued.",
  );
});
