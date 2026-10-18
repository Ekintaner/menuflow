import { readFileSync } from "node:fs";

export const imagePrefix = "/storage/v1/object/sign/menu-images/";
export function signedImagePath(value) {
  try {
    const u = new URL(value);
    const parts = u.pathname.slice(imagePrefix.length).split("/");
    if (
      u.origin !== "http://127.0.0.1:55431" ||
      !u.pathname.startsWith(imagePrefix) ||
      parts.length !== 3 ||
      parts.some(
        (p) => !/^[a-zA-Z0-9_.-]+$/.test(p) || p === "." || p === "..",
      ) ||
      [...u.searchParams.keys()].join(",") !== "token" ||
      !/^[A-Za-z0-9_.-]{20,4096}$/.test(u.searchParams.get("token") ?? "")
    )
      return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}
export function rewriteImages(value) {
  if (Array.isArray(value)) return value.map(rewriteImages);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === "image_url" && typeof v === "string" && signedImagePath(v)
          ? "/_pilot" + signedImagePath(v)
          : rewriteImages(v),
      ]),
    );
  return value;
}
export function localEnv() {
  const env = {};
  const allowed = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PLATFORM_ADMIN_USER_ID",
  ];
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && allowed.includes(m[1]))
      env[m[1]] = m[2].startsWith('"') ? JSON.parse(m[2]) : m[2];
  }
  if (
    env.SUPABASE_URL !== "http://127.0.0.1:55431" ||
    allowed.some((k) => !env[k])
  )
    throw Error("Dedicated local environment required.");
  return env;
}
