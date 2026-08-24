if (process.env.NODE_ENV !== "production") {
  throw new Error(
    "The server bundle must be built with NODE_ENV=production so production safeguards are not compiled out.",
  );
}

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
