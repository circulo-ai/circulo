import { defineConfig } from "tsdown";

export default defineConfig({
  plugins: [],
  dts: true,
  entry: {
    index: "src/index.ts",
    react: "src/react.ts",
    definitions: "src/definitions.ts",
    config: "src/config.ts",
    adapters: "src/adapters/index.ts",
    durable: "src/durable/index.ts",
    workers: "src/workers/index.ts",
    scheduler: "src/scheduler/index.ts",
    security: "src/security/index.ts",
    telemetry: "src/telemetry/index.ts",
  },
  outDir: "dist",
  clean: true,
});
