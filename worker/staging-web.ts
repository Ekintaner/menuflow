import { onRequest } from "../functions/api/[[path]]";

interface WebEnv {
  MENUFLOW_API?: { fetch(request: Request): Promise<Response> };
  ASSETS: { fetch(request: Request): Promise<Response> };
}

// Alternate free hostname for networks that cannot reach pages.dev.
// The API remains private behind the same service binding as Pages.
export default {
  fetch(request: Request, env: WebEnv) {
    return new URL(request.url).pathname.startsWith("/api/")
      ? onRequest({ request, env })
      : env.ASSETS.fetch(request);
  },
};
