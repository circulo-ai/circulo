import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const serverRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
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
