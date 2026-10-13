import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: [
      // Anchored on "@/" so scoped package names such as "@t3-oss/env-nextjs"
      // are not rewritten into the source tree.
      { find: /^@\//, replacement: `${webRoot}src/` },
      // zod 4 lists a non-standard "@zod/source" export condition first, which
      // Vite resolves to the package's TypeScript source. That entry does not
      // expose the `z` namespace, so anything importing `{ z }` sees undefined.
      // Pin the published ESM entry instead.
      { find: /^zod$/, replacement: require.resolve("zod") },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
