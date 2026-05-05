import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // platformProxy reads .dev.vars via workerd — disabled because workerd requires macOS 13+.
    // Local dev uses import.meta.env from apps/web/.env instead.
    platformProxy: { enabled: false },
  }),
  integrations: [tailwind()],
  vite: {
    resolve: {
      alias: {
        "~": "/src",
      },
    },
  },
});
