import { type Config } from "prettier";

export function getGlobalPrettierConfig({
  plugins,
  ...config
}: Config = {}): Config {
  return {
    endOfLine: "lf",
    plugins: ["prettier-plugin-organize-imports", ...(plugins ?? [])],
    ...config,
  };
}
