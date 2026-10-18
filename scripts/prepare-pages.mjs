import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
const environment = process.argv[2];
if (!["staging", "pilot"].includes(environment))
  throw new Error("Expected staging or pilot");
const root = realpathSync(process.cwd()),
  parent = resolve(root, ".wrangler"),
  target = resolve(parent, `pages-${environment}`);
// Only replace this script's explicitly marked generated package inside this workspace.
if (dirname(target) !== parent || basename(target) !== `pages-${environment}`)
  throw new Error("Unsafe output path");
if (!existsSync(resolve(root, "dist/index.html")))
  throw new Error("Run npm run build first");
if (existsSync(target)) {
  if (
    realpathSync(target) !== target ||
    !existsSync(resolve(target, ".menuflow-generated"))
  )
    throw new Error("Output is not a recognised generated package");
  rmSync(target, { recursive: true });
}
mkdirSync(target, { recursive: true });
writeFileSync(
  resolve(target, ".menuflow-generated"),
  "Local build package; no secrets.\n",
);
cpSync(resolve(root, "dist"), resolve(target, "dist"), { recursive: true });
if (environment === "staging") {
  const headers = resolve(target, "dist/_headers");
  writeFileSync(
    headers,
    readFileSync(headers, "utf8") + "\n/*\n  X-Robots-Tag: noindex, nofollow\n",
  );
}
cpSync(resolve(root, "functions"), resolve(target, "functions"), {
  recursive: true,
});
const config = JSON.parse(
  readFileSync(
    resolve(root, `deploy/pages.${environment}.json`),
    "utf8",
  ).replace(/^\uFEFF/, ""),
);
config.$schema = "../../node_modules/wrangler/config-schema.json";
config.pages_build_output_dir = "./dist";
writeFileSync(
  resolve(target, "wrangler.jsonc"),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  `Prepared local Pages package: .wrangler/pages-${environment}. No deployment performed.`,
);
