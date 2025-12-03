import { defineConfig } from "nitro";

const port = process.env.PORT || "3002";

export default defineConfig({
  devServer: {
    port: parseInt(port)
  },
  modules: ["workflow/nitro"],
  externals: {
    inline: ["@circulo/db"],
  },
  routes: {
    "/**": "./src/index.ts"
  }
});
