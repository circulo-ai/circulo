import {
  loadWorkflowDefinition,
  type SerializedWorkflowDefinition,
} from "@circulo-ai/wf";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CliCommandContext, ValidatedWorkflowDocument } from "../types";
import type { CliArguments } from "./command-runner";

export async function loadAndValidateDefinitionAsync(
  args: CliArguments,
  context: CliCommandContext,
): Promise<ValidatedWorkflowDocument> {
  const inputPath = requiredPositional(args, "workflow definition path");
  const absolutePath = resolve(context.cwd, inputPath);
  let source: string;
  try {
    source = readFileSync(absolutePath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read workflow definition ${absolutePath}: ${errorMessage(error)}`,
    );
  }
  const format = definitionFormat(absolutePath);
  const { loadWfProject } = await import("../config/load-config");
  const project = await loadWfProject(
    context.cwd,
    optionString(args, "config"),
  );
  const profile =
    optionString(args, "profile") ?? project.config.defaultProfile;
  if (!project.config.profiles.includes(profile)) {
    throw new Error(
      `Profile "${profile}" is not configured. Available profiles: ${project.config.profiles.join(", ")}.`,
    );
  }
  const registry = project.config.registry;
  if (!registry) {
    throw new Error(
      `The config at ${project.configPath} does not expose a step registry. Add a registry to defineWfConfig().`,
    );
  }
  loadWorkflowDefinition(source, {
    format,
    registry,
    ...(format === "yaml" ? { parser: { parse: parseYaml } } : {}),
  });
  const document = parseDocument(source, format);
  return {
    document,
    registry,
    format,
    orderedStepIds: orderStepIds(document),
    profile,
  };
}

export function requiredPositional(args: CliArguments, name: string): string {
  const value = args.positional[0];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function optionString(
  args: CliArguments,
  name: string,
): string | undefined {
  const value = args.options[name];
  return typeof value === "string" ? value : undefined;
}

export function isJsonOutput(args: CliArguments): boolean {
  return args.options["json"] === true || args.options["format"] === "json";
}

function definitionFormat(path: string): "json" | "yaml" {
  const extension = extname(path).toLowerCase();
  if (extension === ".yaml" || extension === ".yml") return "yaml";
  if (extension === ".json") return "json";
  throw new Error(
    `Unsupported workflow definition extension "${extension}". Use .json, .yaml, or .yml.`,
  );
}

function parseDocument(
  source: string,
  format: "json" | "yaml",
): SerializedWorkflowDefinition {
  const value: unknown =
    format === "json"
      ? (JSON.parse(source) as unknown)
      : (parseYaml(source) as unknown);
  if (!isRecord(value))
    throw new Error("Workflow definition document must be an object.");
  const steps = value["steps"];
  if (!Array.isArray(steps))
    throw new Error("Workflow definition document must contain steps.");
  return value as unknown as SerializedWorkflowDefinition;
}

function orderStepIds(
  document: SerializedWorkflowDefinition,
): readonly string[] {
  const byId = new Map(document.steps.map((step) => [step.id, step] as const));
  const targeted = new Set(
    document.steps.flatMap((step) =>
      step.nextStepId ? [step.nextStepId] : [],
    ),
  );
  const ordered: string[] = [];
  let current = document.steps.find((step) => !targeted.has(step.id));
  while (current) {
    ordered.push(current.id);
    current = current.nextStepId ? byId.get(current.nextStepId) : undefined;
  }
  return ordered;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown file system error";
}
