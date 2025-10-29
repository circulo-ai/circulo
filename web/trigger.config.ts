import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_ipujyewfumdfydtdqsry",
  dirs: ["./src/trigger"],
  ignorePatterns: ["trigger.dev/**", "**/*.test.*", "**/*.spec.*"],
  maxDuration: 300, // 5 minutes
});