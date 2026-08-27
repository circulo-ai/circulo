import { defineConfig } from "tsdown";

export default defineConfig({
  plugins: [],
  dts: true,
  entry: {
    index: "src/index.ts",
    react: "src/react.ts",
    definitions: "src/definitions.ts",
    config: "src/config.ts",
  },
  outDir: "dist",
  clean: true,
});
