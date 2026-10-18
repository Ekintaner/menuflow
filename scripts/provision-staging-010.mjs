import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const dir = ".wrangler/staging-010-qnvsioxptgxrmoprlbbc/";
const secrets = JSON.parse(readFileSync(dir + "server-secrets.json", "utf8"));
if (secrets.SUPABASE_URL !== "https://qnvsioxptgxrmoprlbbc.supabase.co")
  throw Error("Wrong staging target");
const db = createClient(
  secrets.SUPABASE_URL,
  secrets.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const checked = (r) => {
  if (r.error) throw Error("Staging provisioning failed: " + r.error.code);
  return r.data;
};
const email = "admin@menuflow.com"; // Fictional staging operator; no email is sent.
let operator = secrets.PLATFORM_ADMIN_USER_ID;
if (!operator) {
  const users = checked(
    await db.auth.admin.listUsers({ page: 1, perPage: 100 }),
  ).users;
  if (users.length)
    throw Error(
      "Unexpected existing Auth identities; refusing to replace them.",
    );
  const invitation = checked(
    await db.auth.admin.generateLink({ type: "invite", email }),
  );
  operator = invitation.user.id;
  secrets.PLATFORM_ADMIN_USER_ID = operator;
  writeFileSync(dir + "server-secrets.json", JSON.stringify(secrets), {
    mode: 0o600,
  });
  const user = createClient(
    secrets.SUPABASE_URL,
    secrets.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const verified = checked(
    await user.auth.verifyOtp({
      type: "invite",
      token_hash: invitation.properties.hashed_token,
    }),
  );
  writeFileSync(
    dir + "fixture-session.json",
    JSON.stringify({ token: verified.session.access_token, user_id: operator }),
    { mode: 0o600 },
  );
} else {
  const user = checked(await db.auth.admin.getUserById(operator)).user;
  if (user.email !== email) throw Error("Unexpected operator identity");
}
const slug = "codex010-test-kafe";
let tenant = checked(
  await db.from("tenants").select("id").eq("slug", slug).maybeSingle(),
)?.id;
if (!tenant)
  tenant = checked(
    await db.rpc("platform_provision", {
      operation: "create",
      actor: operator,
      restaurant_name: "MenuFlow Test Kafe",
      restaurant_slug: slug,
      owner_user: operator,
      table_count: 4,
    }),
  );
const catalog = [
  ["Kahveler", "Filtre kahve", 12000, "coffee"],
  ["Kahveler", "Cappuccino", 14500, null],
  ["Tatlılar", "Günün pastası", 18000, "cake"],
];
for (const [categoryName, name, price, image] of catalog) {
  let category = checked(
    await db
      .from("categories")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("name", categoryName)
      .maybeSingle(),
  );
  if (!category)
    category = checked(
      await db
        .from("categories")
        .insert({ tenant_id: tenant, name: categoryName })
        .select("id")
        .single(),
    );
  let product = checked(
    await db
      .from("products")
      .select("id,image_path")
      .eq("tenant_id", tenant)
      .eq("name", name)
      .maybeSingle(),
  );
  if (!product)
    product = checked(
      await db
        .from("products")
        .insert({
          tenant_id: tenant,
          category_id: category.id,
          name,
          price_minor: price,
          description:
            "Yalnız sentetik pilot testi içindir; gerçek satış değildir.",
          available: true,
        })
        .select("id,image_path")
        .single(),
    );
  if (image && !product.image_path) {
    const path = `${tenant}/${product.id}/${randomUUID()}.jpg`;
    checked(
      await db.storage
        .from("menu-images")
        .upload(path, readFileSync(`public/demo/${image}.jpg`), {
          contentType: "image/jpeg",
        }),
    );
    checked(
      await db
        .from("products")
        .update({ image_path: path })
        .eq("tenant_id", tenant)
        .eq("id", product.id),
    );
  }
}
const tables = checked(
  await db
    .from("dining_tables")
    .select("id,name")
    .eq("tenant_id", tenant)
    .order("name"),
);
if (!existsSync(dir + "demo-manifest.json")) {
  const qrTables = [];
  for (const table of tables) {
    const qr = randomBytes(32).toString("hex");
    checked(
      await db.rpc("platform_provision", {
        operation: "rotate_qr",
        actor: operator,
        target_tenant: tenant,
        target_table: table.id,
        supplied_hash: createHash("sha256").update(qr).digest("hex"),
      }),
    );
    qrTables.push({ ...table, qr });
  }
  writeFileSync(
    dir + "demo-manifest.json",
    JSON.stringify({
      tenant,
      operator,
      tables: qrTables,
      origin: "https://menuflow-staging.pages.dev",
    }),
    { mode: 0o600, flag: "wx" },
  );
}
// Publish only the fictional menu; new orders remain closed at both tenant and Worker levels.
checked(
  await db
    .from("tenant_settings")
    .update({ menu_published: true, ordering_enabled: false })
    .eq("tenant_id", tenant),
);
console.log(
  "Fictional staging operator/catalog/four tables prepared. Password was not set. New orders remain disabled. No credentials or QR tokens logged.",
);
