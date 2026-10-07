const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../../..");
const bun = process.env.CIRCULO_DESKTOP_BUN || "bun";
const result = spawnSync(
  bun,
  ["--cwd", path.join(root, "apps", "web"), "build"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      SERVER_API_URL: "http://127.0.0.1:3322",
      NEXT_PUBLIC_BETTER_AUTH_URL: "http://127.0.0.1:3322",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3310",
      NEXT_PUBLIC_CIRCULO_RUNTIME_KIND: "desktop",
    },
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
