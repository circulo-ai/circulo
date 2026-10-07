const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const stagingRoot = path.join(desktopRoot, "runtime-build");

fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(stagingRoot, { recursive: true });

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  copyEntry(source, destination);
}

function copyEntry(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    let target;
    try {
      // Resolve the link text first. On Windows, realpathSync can fail with
      // EPERM for Bun-created directory links even when the target exists.
      const linkTarget = fs.readlinkSync(source);
      const resolvedLinkTarget = path.resolve(path.dirname(source), linkTarget);
      target = fs.existsSync(resolvedLinkTarget)
        ? resolvedLinkTarget
        : fs.realpathSync(source);
    } catch {
      console.warn(`Skipping unresolved standalone symlink: ${source}`);
      return;
    }
    copyEntry(target, destination);

    // Bun stores a package's transitive dependencies beside the package in
    // the same node_modules directory. Once the workspace symlink is
    // dereferenced, Node's normal package lookup no longer reaches that
    // sibling directory. Carry those siblings into the copied package so the
    // staged runtime remains self-contained.
    const packageNodeModules = path.dirname(target);
    if (path.basename(packageNodeModules) === "node_modules") {
      const dependencyDestination = path.join(destination, "node_modules");
      for (const dependency of fs.readdirSync(packageNodeModules)) {
        if (dependency === path.basename(target)) continue;
        const dependencySource = path.join(packageNodeModules, dependency);
        const dependencyTarget = path.join(dependencyDestination, dependency);
        if (fs.existsSync(dependencyTarget)) continue;
        copyEntry(dependencySource, dependencyTarget);
      }
    }
    return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyEntry(path.join(source, child), path.join(destination, child));
    }
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

copy(path.join(repoRoot, "apps/server/dist"), path.join(stagingRoot, "server"));
fs.writeFileSync(
  path.join(stagingRoot, "server/package.json"),
  JSON.stringify({ type: "module" }),
);
const pgliteVectorBundle = path.join(
  repoRoot,
  "packages/db/node_modules/@electric-sql/pglite-pgvector/dist/vector.tar.gz",
);
if (fs.existsSync(pgliteVectorBundle)) {
  copy(pgliteVectorBundle, path.join(stagingRoot, "server/vector.tar.gz"));
}
const pgliteDataBundle = path.join(
  repoRoot,
  "packages/db/node_modules/@electric-sql/pglite/dist/pglite.data",
);
if (fs.existsSync(pgliteDataBundle)) {
  copy(pgliteDataBundle, path.join(stagingRoot, "server/pglite.data"));
}
const pgliteWasmBundle = path.join(
  repoRoot,
  "packages/db/node_modules/@electric-sql/pglite/dist/pglite.wasm",
);
if (fs.existsSync(pgliteWasmBundle)) {
  copy(pgliteWasmBundle, path.join(stagingRoot, "server/pglite.wasm"));
}
const pgliteInitdbWasmBundle = path.join(
  repoRoot,
  "packages/db/node_modules/@electric-sql/pglite/dist/initdb.wasm",
);
if (fs.existsSync(pgliteInitdbWasmBundle)) {
  copy(pgliteInitdbWasmBundle, path.join(stagingRoot, "server/initdb.wasm"));
}
copy(
  path.join(repoRoot, "apps/web/.next/standalone"),
  path.join(stagingRoot, "web"),
);
copy(
  path.join(repoRoot, "apps/web/.next/static"),
  path.join(stagingRoot, "web/apps/web/.next/static"),
);
copy(
  path.join(repoRoot, "apps/web/public"),
  path.join(stagingRoot, "web/apps/web/public"),
);
copy(
  path.join(repoRoot, "packages/db/migrations"),
  path.join(stagingRoot, "db/migrations"),
);

console.log(`Prepared self-contained desktop runtime at ${stagingRoot}`);
