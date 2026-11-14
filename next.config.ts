import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  // Loaded with Node's require instead of being bundled. `pg` is already on Next's default list,
  // but OpenNext only reads this explicit list when deciding which packages to copy in full for
  // the "workerd" build condition: without `pg-cloudflare` here, only its Node stub
  // (dist/empty.js) is traced and the Worker build cannot resolve its Workers socket code.
  serverExternalPackages: ["pg", "pg-cloudflare"],
  async headers() {
    return [
      {
        // Browsers must always re-check the service worker so updates roll out promptly.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
