import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8798",
        configure(proxy) {
          proxy.on("proxyReq", (outgoing, incoming) => {
            // Preserve the browser Origin: the Worker sees the original Host.
            // The proxy must never translate a foreign Origin into a trusted one.
            if (incoming.headers.origin)
              outgoing.setHeader("origin", incoming.headers.origin);
            else outgoing.removeHeader("origin");
          });
        },
      },
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
