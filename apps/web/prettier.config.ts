import { getGlobalPrettierConfig } from "@circulo-ai/prettier-config";

export default getGlobalPrettierConfig({
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindFunctions: ["cn", "cva"],
  tailwindStylesheet: "./src/app/globals.css",
});
