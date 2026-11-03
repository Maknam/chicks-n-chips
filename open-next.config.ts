import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR or persistent Next.js cache is used by this MVP.
export default defineCloudflareConfig();
