import type { Config } from "drizzle-kit";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function loadLocalDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const configDirectory = dirname(fileURLToPath(import.meta.url));
  const envFiles = [
    resolve(configDirectory, "../../apps/server/.env"),
    resolve(configDirectory, ".env"),
    resolve(process.cwd(), ".env"),
  ];

  for (const envFile of envFiles) {
    try {
      const contents = readFileSync(envFile, "utf8");
      const match = contents.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
      if (!match?.[1]) continue;

      const value = match[1].trim().replace(/^['"]|['"]$/g, "");
      if (value) return value;
    } catch {
      // The config remains usable in CI where DATABASE_URL is injected.
    }
  }

  throw new Error(
    "DATABASE_URL is required. Set it in the environment or apps/server/.env.",
  );
}

export default {
  schema: "./schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: loadLocalDatabaseUrl(),
  },
} satisfies Config;
