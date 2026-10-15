import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const serverRoot = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^zod$/, replacement: require.resolve("zod") },
      {
        find: /^@\/db\/(.*)$/,
        replacement: `${serverRoot}../../packages/db/dist/$1`,
      },
      {
        find: "@/db",
        replacement: `${serverRoot}../../packages/db/dist`,
      },
      { find: "@", replacement: `${serverRoot}src` },
    ],
  },
});
