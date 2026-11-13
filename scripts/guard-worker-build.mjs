// Stops a production Worker build when Next.js .env files are present.
// OpenNext compiles .env, .env.local and .env.<mode>[.local] into the Worker bundle as fallbacks
// for any variable Cloudflare does not set, so a local build would ship Development credentials
// and silently use them if a production secret were missing. Build production in CI instead,
// or move the files aside. `.env.prod` (used only by db:*:prod scripts) is not read by Next.
import { existsSync } from "node:fs";

const files = [".env", ".env.local"].concat(
  ...["production", "development", "test"].map((m) => [`.env.${m}`, `.env.${m}.local`]),
);
const found = files.filter((f) => existsSync(f));
if (found.length) {
  console.error(
    `Refusing to build the production Worker: ${found.join(", ")} would be bundled into it.\n` +
      "Deploy from CI (no env files), or temporarily move these files out of the project folder.",
  );
  process.exit(1);
}
