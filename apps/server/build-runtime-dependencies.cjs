const {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { createRequire, isBuiltin } = require("node:module");
const { dirname, join, resolve } = require("node:path");

// Resolve package manifests first: Bun's runtime shims (such as abort-controller)
// are unavailable in the packaged Node runtime, which needs the installed package.
const sourceRoot = resolve(__dirname, "../../packages/file-parsers");
const buildRoot = resolve(__dirname, "dist");
const destination = resolve(buildRoot, "node_modules");
if (dirname(destination) !== buildRoot)
  throw new Error(
    "Runtime dependencies must stay inside the server build directory",
  );
rmSync(destination, { recursive: true, force: true });
const staged = new Map();
const visiting = new Set();

function stage(name, from, parentDestination = destination) {
  if (isBuiltin(name)) return;
  const require = createRequire(join(from, "package.json"));
  let entry;
  try {
    entry = require.resolve(`${name}/package.json`);
  } catch {
    // Some packages restrict package.json through their exports map.
    entry = require.resolve(name);
  }
  let source = dirname(entry);
  let manifest;
  while (source !== dirname(source)) {
    const filename = join(source, "package.json");
    if (existsSync(filename)) {
      const candidate = JSON.parse(readFileSync(filename, "utf8"));
      if (candidate.name === name) {
        manifest = candidate;
        break;
      }
    }
    source = dirname(source);
  }
  if (!manifest) throw new Error(`Cannot locate runtime package ${name}`);
  const installedVersion = staged.get(name);
  const target = join(
    installedVersion && installedVersion !== manifest.version
      ? parentDestination
      : destination,
    name,
  );
  const key = `${target}:${manifest.version}`;
  if (visiting.has(key)) return;
  visiting.add(key);
  if (!installedVersion) staged.set(name, manifest.version);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    dereference: true,
    filter: (entry) =>
      entry === source || !entry.startsWith(join(source, "node_modules")),
  });
  for (const dependency of Object.keys(manifest.dependencies ?? {}))
    stage(dependency, source, join(target, "node_modules"));
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
    try {
      require.resolve(dependency);
    } catch {
      continue;
    }
    stage(dependency, source, join(target, "node_modules"));
  }
}
for (const name of ["pdf-parse", "officeparser", "word-extractor"])
  stage(name, sourceRoot);
console.log(
  "Staged document parser dependencies and assets for the Node runtime",
);
