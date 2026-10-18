import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const vars = Object.fromEntries(
  readFileSync(".dev.vars", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const n = l.indexOf("=");
      return [l.slice(0, n), JSON.parse(l.slice(n + 1))];
    }),
);
if (vars.SUPABASE_URL !== "http://127.0.0.1:55431")
  throw Error("Dedicated local stack only.");
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function checked(r) {
  if (r.error) throw Error("Local demo operation failed: " + r.error.code);
  return r.data;
}
if (existsSync(".wrangler/demo-008.json"))
  throw Error("Sample manifest exists; reuse it. No data reset performed.");
const slug = "codex008-ornek-kiyi";
let tenant = checked(
  await db.from("tenants").select("id").eq("slug", slug).maybeSingle(),
)?.id;

if (!tenant) {
  tenant = checked(
    await db
      .from("tenants")
      .insert({
        name: "Kıyı Kahve",
        slug,
        currency: "TRY",
        timezone: "Europe/Istanbul",
      })
      .select("id")
      .single(),
  ).id;
  checked(
    await db
      .from("tenant_settings")
      .insert({
        tenant_id: tenant,
        menu_published: true,
        ordering_enabled: true,
        acceptance_mode: "manual",
      }),
  );
  const password = randomBytes(32).toString("base64url");
  const email = "demo-owner-" + randomUUID() + "@example.test";
  const u = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (u.error || !u.data.user) throw Error("Demo owner failed");
  checked(
    await db.from("memberships").insert([
      { tenant_id: tenant, user_id: u.data.user.id, role: "owner" },
      {
        tenant_id: tenant,
        user_id: vars.PLATFORM_ADMIN_USER_ID,
        role: "owner",
      },
    ]),
  );
}
const members = checked(
  await db.from("memberships").select("user_id").eq("tenant_id", tenant),
);
const owner = members.find(
  (m) => m.user_id !== vars.PLATFORM_ADMIN_USER_ID,
).user_id;
const ownerInfo = await db.auth.admin.getUserById(owner);
const link = await db.auth.admin.generateLink({
  type: "recovery",
  email: ownerInfo.data.user.email,
});
if (link.error) throw Error("Demo session generation failed");
const manager = createClient(vars.SUPABASE_URL, vars.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = await manager.auth.verifyOtp({
  type: "recovery",
  token_hash: link.data.properties.hashed_token,
});
if (auth.error) throw Error("Demo session failed");

let cats = checked(
  await manager.from("categories").select("id,name").eq("tenant_id", tenant),
);
if (!cats.length)
  cats = checked(
    await manager
      .from("categories")
      .insert([
        { tenant_id: tenant, name: "Kahveler", sort_order: 0 },
        { tenant_id: tenant, name: "Tatlılar", sort_order: 1 },
        { tenant_id: tenant, name: "Soğuk içecekler", sort_order: 2 },
      ])
      .select("id,name"),
  );
const cat = (n) => cats.find((c) => c.name === n).id;
let products = checked(
  await manager
    .from("products")
    .select("id,name,image_path")
    .eq("tenant_id", tenant),
);
if (!products.length)
  products = checked(
    await manager
      .from("products")
      .insert(
        [
          {
            tenant_id: tenant,
            category_id: cat("Kahveler"),
            name: "Filtre kahve",
            description:
              "Günlük öğütülen çekirdekler. Dengeli gövde, çikolata ve narenciye notaları.",
            price_minor: 12000,
            sort_order: 0,
          },
          {
            tenant_id: tenant,
            category_id: cat("Kahveler"),
            name: "Cappuccino",
            description:
              "Çift espresso, sıcak süt ve ince süt köpüğü. Yumuşak, yoğun ve dengeli.",
            price_minor: 14500,
            sort_order: 1,
          },
          {
            tenant_id: tenant,
            category_id: cat("Kahveler"),
            name: "Espresso",
            description: "Taze çekilmiş kahve, kısa ve yoğun bir fincan.",
            price_minor: 9500,
            sort_order: 2,
          },
          {
            tenant_id: tenant,
            category_id: cat("Tatlılar"),
            name: "Günün pastası",
            description:
              "Mevsim meyveleriyle hazırlanan, mutfağımızdan taze bir dilim.",
            price_minor: 18000,
            sort_order: 0,
          },
          {
            tenant_id: tenant,
            category_id: cat("Tatlılar"),
            name: "Bademli kurabiye",
            description:
              "Dışı çıtır, içi yumuşak. Kahvenizin yanında küçük bir mola.",
            price_minor: 7500,
            available: false,
            sort_order: 1,
          },
          {
            tenant_id: tenant,
            category_id: cat("Soğuk içecekler"),
            name: "Ev yapımı limonata",
            description: "Taze limon, nane ve az şeker. Buzla servis edilir.",
            price_minor: 9000,
            sort_order: 0,
          },
        ].map((p) => ({ available: true, ...p })),
      )
      .select("id,name"),
  );
for (const [name, file] of [
  ["Filtre kahve", "coffee"],
  ["Günün pastası", "cake"],
]) {
  const p = products.find((p) => p.name === name);
  if (p.image_path) continue;
  const path = `${tenant}/${p.id}/${randomUUID()}.jpg`;
  checked(
    await manager.storage
      .from("menu-images")
      .upload(path, readFileSync(`public/demo/${file}.jpg`), {
        contentType: "image/jpeg",
      }),
  );
  checked(
    await manager
      .from("products")
      .update({ image_path: path })
      .eq("tenant_id", tenant)
      .eq("id", p.id),
  );
}
const tables = checked(
  await manager
    .from("dining_tables")
    .insert(
      Array.from({ length: 6 }, (_, i) => ({
        tenant_id: tenant,
        name: "Masa " + (i + 1),
      })),
    )
    .select("id,name"),
);
const qr = randomBytes(32).toString("hex");
const table = tables.find((t) => t.name === "Masa 5");
checked(
  await db
    .from("table_qr_tokens")
    .insert({
      tenant_id: tenant,
      table_id: table.id,
      token_hash: createHash("sha256").update(qr).digest("hex"),
      version: 1,
    }),
);
mkdirSync(".wrangler", { recursive: true });
writeFileSync(
  ".wrangler/demo-008.json",
  JSON.stringify({
    tenant,
    table: table.id,
    qr,
    owner,
    access_token: auth.data.session.access_token,
  }),
  { mode: 0o600 },
);
console.log(
  "Fictional local restaurant, six tables, six products and private image fixtures are ready. No credentials printed.",
);
