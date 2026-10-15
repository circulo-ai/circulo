const { existsSync } = require("node:fs");
const { join } = require("node:path");

// electron-builder deliberately excludes a source directory's root node_modules.
// The separate extraResources mapping must survive packaging on every platform.
module.exports = async ({ appOutDir, electronPlatformName, packager }) => {
  const resources =
    electronPlatformName === "darwin"
      ? join(
          appOutDir,
          `${packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : join(appOutDir, "resources");
  for (const name of ["pdf-parse", "officeparser", "word-extractor"]) {
    if (
      !existsSync(
        join(
          resources,
          "runtime",
          "server",
          "node_modules",
          name,
          "package.json",
        ),
      )
    ) {
      throw new Error(`Packaged document parser is missing: ${name}`);
    }
  }
};
