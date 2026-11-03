import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
export default defineConfig([
  ...next,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", ".open-next/**", ".wrangler/**", "cloudflare-env.d.ts", "node_modules/**", "public/sw.js"]),
]);
