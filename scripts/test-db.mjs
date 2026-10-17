import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const container = `menuflow-db-test-${process.pid}`;
function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout + result.stderr;
}
try {
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    container,
    "--network",
    "none",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine",
  ]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"])
        .status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Local PostgreSQL did not become ready");
  const sql = (path) =>
    docker(
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      readFileSync(path, "utf8"),
    );
  sql("supabase/tests/bootstrap.sql");
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql(`supabase/migrations/${file}`);
  console.log(sql("supabase/tests/isolation.sql"));
  console.log(sql("supabase/tests/menu.sql"));
  console.log(sql("supabase/tests/orders.sql"));
  const payload = docker([
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-Atc",
    "select test_payload()",
  ]).trim();
  await Promise.all(
    Array.from(
      { length: 10 },
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(
            "docker",
            [
              "exec",
              "-i",
              container,
              "psql",
              "-X",
              "-U",
              "postgres",
              "-v",
              "ON_ERROR_STOP=1",
            ],
            { stdio: ["pipe", "pipe", "pipe"] },
          );
          let output = "";
          child.stdout.on("data", (b) => (output += b));
          child.stderr.on("data", (b) => (output += b));
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(output)),
          );
          child.stdin.end(
            `set role service_role; select create_guest_order(repeat('c',64),'parallel','${payload}'::jsonb);`,
          );
        }),
    ),
  );
  // A product edit holds its row lock before the order starts. The order must
  // wait, then reject its stale menu version without writing any partial rows.
  for (const change of ["price_minor=1300", "available=false"]) {
    const stale = docker([
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-Atc",
      "select test_payload()",
    ]).trim();
    let release, rejectLocked;
    const locked = new Promise((resolve, reject) => {
      release = resolve;
      rejectLocked = reject;
    });
    const editor = spawn("docker", [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-At",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    let output = "";
    editor.stdout.on("data", (b) => {
      output += b;
      if (output.includes("row-locked")) release();
    });
    editor.stderr.on("data", (b) => (output += b));
    const edited = new Promise((resolve, reject) => {
      editor.on("error", (e) => {
        rejectLocked(e);
        reject(e);
      });
      editor.on("exit", (code) => {
        if (code === 0) resolve();
        else {
          const e = new Error(output);
          rejectLocked(e);
          reject(e);
        }
      });
    });
    editor.stdin.end(
      `begin; update products set ${change} where tenant_id='40000000-0000-0000-0000-000000000001'; select 'row-locked'; select pg_sleep(0.5); commit;`,
    );
    await locked;
    console.log(
      docker(
        [
          "exec",
          "-i",
          container,
          "psql",
          "-X",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        `select test_error($q$select create_guest_order(repeat('c',64),'race','${stale}'::jsonb)$q$,'MENU_CHANGED');`,
      ),
    );
    await edited;
    console.log(
      docker(
        [
          "exec",
          "-i",
          container,
          "psql",
          "-X",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        `select test_assert((select count(*)=1 from orders) and (select count(*)=1 from order_events),'concurrent product edit leaves no partial order');`,
      ),
    );
  }
  docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    `update products set available=true;`,
  );
  console.log(
    "PASS: concurrent price/availability edits serialize before order validation",
  );
  console.log(sql("supabase/tests/orders-results.sql"));
  console.log(sql("supabase/tests/order-management.sql"));
  const pg = [
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ];
  docker(
    pg,
    `insert into auth.users values('50000000-0000-0000-0000-000000000001');
    insert into memberships(tenant_id,user_id,role) values('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','staff');
    update orders set status='pending_acceptance',version=1;`,
  );
  const orderId = docker([
    "exec",
    container,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-Atc",
    "select id from orders order by id limit 1",
  ]).trim();
  const runSql = (input, onLocked) =>
    new Promise((resolve, reject) => {
      const child = spawn("docker", pg, { stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", (b) => {
        output += b;
        if (onLocked && output.includes("settings-locked")) onLocked();
      });
      child.stderr.on("data", (b) => (output += b));
      child.on("error", reject);
      child.on("exit", (code) => resolve({ code, output }));
      child.stdin.end(input);
    });
  const before = Number(
    docker([
      "exec",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-Atc",
      `select count(*) from order_events where order_id='${orderId}'`,
    ]).trim(),
  );
  const race = await Promise.all(
    ["accepted", "rejected"].map((status) =>
      runSql(`set role authenticated;
    set request.jwt.claim.sub='50000000-0000-0000-0000-000000000001';
    select transition_order('40000000-0000-0000-0000-000000000001','${orderId}',1,'${status}','race');`),
    ),
  );
  if (
    race.filter((r) => r.code === 0).length !== 1 ||
    !race.some((r) => r.output.includes("VERSION_CONFLICT"))
  )
    throw Error("Transition race did not produce exactly one winner");
  console.log(
    docker(
      pg,
      `select test_assert((select version=2 from orders where id='${orderId}'),'parallel transition increments once');
    select test_assert((select count(*)=${before + 1} from order_events where order_id='${orderId}'),'parallel transition emits one event');
    select test_assert((select count(*)=1 from audit_logs where target_id='${orderId}' and action like 'order:%'),'parallel transition emits one audit');`,
    ),
  );
  console.log(
    "PASS: separate PostgreSQL connections produce one transition winner and one VERSION_CONFLICT",
  );
  docker(
    pg,
    `update dining_tables set active=true;
    update tenant_settings set acceptance_mode='manual',ordering_enabled=true;`,
  );
  const settingsPayload = docker([
    "exec",
    container,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-Atc",
    "select test_payload() || jsonb_build_object('session_id',(select id from guest_sessions where session_hash=repeat('f',64)))",
  ]).trim();
  let markLocked;
  const settingsLocked = new Promise((resolve) => {
    markLocked = resolve;
  });
  const settingsEdit = runSql(
    `begin; update tenant_settings set acceptance_mode='automatic' where tenant_id='40000000-0000-0000-0000-000000000001';
    select 'settings-locked'; select pg_sleep(0.8); commit;`,
    markLocked,
  );
  await settingsLocked;
  const creation = await runSql(
    `set role service_role; select create_guest_order(repeat('f',64),'settings-race','${settingsPayload}'::jsonb);`,
  );
  const settingsResult = await settingsEdit;
  if (creation.code !== 0 || settingsResult.code !== 0)
    throw Error(creation.output + settingsResult.output);
  console.log(
    docker(
      pg,
      `select test_assert(exists(select 1 from orders o join idempotency_records i on i.order_id=o.id and i.tenant_id=o.tenant_id where i.key='settings-race' and o.acceptance_mode='automatic' and o.status='accepted'),'concurrent creation observes committed acceptance mode');
    select test_assert((select version=2 from orders where id='${orderId}'),'settings change preserves existing order version');`,
    ),
  );
} finally {
  docker(["rm", "-f", container]);
}
