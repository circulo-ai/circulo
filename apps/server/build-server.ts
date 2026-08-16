const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  sourcemap: "external",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
