import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { createJiti } from "jiti";
import type { WfConfig, WorkflowStepRegistryPort } from "@circulo-ai/wf";
import type { LoadedWfProject } from "../types";

const CONFIG_FILE = "wf.config.ts";
const SUPPORTED_CONFIG_EXTENSIONS = new Set([".ts", ".mts", ".cts", ".js", ".mjs"]);

export function resolveConfigPath(cwd: string, requestedPath?: string): string {
  const candidate = resolve(cwd, requestedPath ?? CONFIG_FILE);
  if (existsSync(candidate)) return candidate;
  if (requestedPath) return candidate;

  for (const extension of SUPPORTED_CONFIG_EXTENSIONS) {
    const withExtension = resolve(cwd, `${CONFIG_FILE.slice(0, -3)}${extension}`);
    if (existsSync(withExtension)) return withExtension;
  }
  return candidate;
}

export async function loadWfProject(
  cwd: string,
  requestedPath?: string,
): Promise<LoadedWfProject> {
  const configPath = resolveConfigPath(cwd, requestedPath);
  if (!SUPPORTED_CONFIG_EXTENSIONS.has(extname(configPath))) {
    throw new Error(
      `Unsupported WF config extension "${extname(configPath) || "none"}". Use a TypeScript or ESM JavaScript config.`,
    );
  }
  if (!existsSync(configPath)) {
    throw new Error(
      `WF config was not found at ${configPath}. Run "wf init" or pass --config <path>.`,
    );
  }

  const module = await createJiti(import.meta.url, {
    moduleCache: false,
    tsconfigPaths: findNearestTsconfig(configPath),
  }).import<unknown>(configPath);
  const candidate = unwrapDefaultExport(module);
  if (!isWfConfig(candidate)) {
    throw new Error(
      `The WF config at ${configPath} must export the result of defineWfConfig().`,
    );
  }
  return { configPath, config: candidate };
}

function unwrapDefaultExport(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const defaultExport = value["default"];
  if (defaultExport !== undefined && isWfConfig(defaultExport)) {
    return defaultExport;
  }
  // Application composition roots commonly export `wf` as a named value so
  // the server can keep other helpers in the same module.
  if (value["wf"] !== undefined) return value["wf"];
  return defaultExport ?? value;
}

function findNearestTsconfig(configPath: string): string | false {
  let directory = dirname(configPath);
  while (true) {
    const candidate = resolve(directory, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

function isWfConfig(value: unknown): value is WfConfig<unknown, unknown, unknown> {
  if (!isRecord(value)) return false;
  const profiles = value["profiles"];
  const defaultProfile = value["defaultProfile"];
  const createRuntime = value["createRuntime"];
  const registry = value["registry"];
  return (
    typeof defaultProfile === "string" &&
    Array.isArray(profiles) &&
    profiles.every((profile) => typeof profile === "string") &&
    typeof createRuntime === "function" &&
    (registry === undefined || isRegistry(registry))
  );
}

function isRegistry(value: unknown): value is WorkflowStepRegistryPort {
  if (!isRecord(value)) return false;
  return (
    typeof value["create"] === "function" &&
    typeof value["has"] === "function" &&
    typeof value["key"] === "function" &&
    typeof value["list"] === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
