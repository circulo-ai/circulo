# @circulo-ai/wf-cli

## 3.0.0

### Major Changes

- ba06c91: Release the synchronized WF v3 ecosystem with readable, durable replay sleeps with absolute deadlines, durable JSON
  history and delayed task adapters, Redis/PostgreSQL durable compositions, and
  the `@circulo-ai/wf/durable` entry point. Standardize package metadata and
  replace broken package-level ESLint commands with Biome checks.

### Patch Changes

- Updated dependencies [ba06c91]
  - @circulo-ai/wf@3.0.0

## 0.1.3

### Patch Changes

- 51165a9: Make project config loading resolve the nearest TypeScript path aliases and support application composition roots that export their WF config as a named `wf` value.

## 0.1.2

### Patch Changes

- dae2f52: Add consistent, typed CLI output formatting with readable tables for human output and stable pretty-printed JSON for automation.

## 0.1.1

### Patch Changes

- a4a8a92: Harden the CLI executable and release path with strict option validation, process-level integration coverage, npm lifecycle builds, clearer file errors, and packed-artifact verification.

## 0.1.0

### Minor Changes

- de60550: Add the `@circulo-ai/wf-cli` developer toolkit with strict project configuration loading, registry-backed JSON/YAML validation, normalized inspection, Mermaid graph output, registry listing, and safe project diagnostics.
