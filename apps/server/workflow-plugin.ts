import { createRequire } from "node:module";
import { transform } from "@swc/core";
import { plugin, type BunPlugin } from "bun";

const require = createRequire(import.meta.url);
const workflowPluginPath = require.resolve("@workflow/swc-plugin");

export const workflowPlugin: BunPlugin = {
  name: "circulo-workflow-transform",
  setup(build) {
    build.onLoad(
      { filter: /[\\/]src[\\/]workflows[\\/].*\.(ts|tsx|js|jsx)$/ },
      async (args) => {
        const source = await Bun.file(args.path).text();
        const result = await transform(source, {
          filename: args.path,
          jsc: {
            experimental: {
              plugins: [[workflowPluginPath, { mode: "client" }]],
            },
          },
        });

        return {
          contents: result.code,
          loader: "ts",
        };
      },
    );
  },
};

plugin(workflowPlugin);
