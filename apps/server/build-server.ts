if (process.env.NODE_ENV !== "production") {
  throw new Error(
    "The server bundle must be built with NODE_ENV=production so production safeguards are not compiled out.",
  );
}

const result = await Bun.build({
  entrypoints: ["./src/index.ts", "./src/node-server.ts"],
  outdir: "./dist",
  // The packaged Electron shell starts node-server.js through Electron's
  // Node runtime, so the production bundle must not depend on Bun globals
  // such as import.meta.require.
  target: "node",
  format: "esm",
  sourcemap: "external",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
