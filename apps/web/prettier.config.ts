import { getGlobalPrettierConfig } from "@circulo-ai/prettier-config";

export default getGlobalPrettierConfig({
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindFunctions: ["twmerge", "clsx", "cva", "cn"],
  tailwindStylesheet: "./src/app/globals.css",
});
