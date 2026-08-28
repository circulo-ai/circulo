# Changelog

## 2.4.0

### Minor Changes

- a0f96cd: Add production-ready, reusable Redis and PostgreSQL workflow adapters, typed backend-neutral composition helpers, distributed locks, idempotency stores, Redis pub/sub, PostgreSQL notification ports, and the `@circulo-ai/wf/adapters` entry point. Document adapter selection, lifecycle ownership, atomicity, and custom backend integration.

## 2.3.0

### Minor Changes

- 2a0ad6a: Add `defineWfConfig()` and the `@circulo-ai/wf/config` entry point for lazy, profile-aware application and tooling runtime composition with explicit lifecycle management.

## 2.2.1

### Patch Changes

- 35b8e2b: Harden durable replay by validating activity inputs against recorded history, preventing duplicate activity side effects after a recorded completion is redelivered, and preserving the original workflow failure when Saga compensations also fail.

## 2.2.0

### Minor Changes

- 76e9b61: Harden the workflow runtime for production workers and improve developer
  experience with validated worker configuration, observable queue failures,
  worker attempt caps, timeout-aware shutdown, generated scheduler identities,
  dispatch error reporting, worker error callbacks for durable activity/timer
  handlers, stable React event subscriptions, and expanded production usage
  documentation. Add class-based and declarative workflow definitions with
  allowlisted step registries, JSON/YAML loading, retry policies, classic saga
  compensation, and versioned replay activity compilation.

## 2.1.0

### Minor Changes

- Release the accumulated public-package improvements, including the upload
  provider adapters, FTP/FTPS support, typed file routers, React upload helpers,
  and the associated runtime and developer-experience updates.

## 2.0.0

### Major Changes

- a3d6bd7: Release the v2 durable orchestration runtime: replay-safe activities, leased
  workers and recovery, parallel/fan-out/fan-in execution, external events,
  signed triggers and webhooks, cron scheduling, Saga compensation, duplicate
  run coalescing, throttling, multi-tenancy primitives, secure React streaming
  adapters, and OpenTelemetry-compatible integrations.

## 1.3.0

### Minor Changes

- 793f85f: Add typed lifecycle hook management and the optional `@circulo-ai/wf/react`
  integration for React workflow state, events, actions, and lifecycle hooks.

## Unreleased

### Minor Changes

- Add a typed lifecycle hook manager with priorities, wildcard listeners,
  one-shot subscriptions, error isolation, and engine integration.
- Add optional `@circulo-ai/wf/react` hooks for workflow state, event history,
  actions, and component-scoped lifecycle listeners.

## 1.2.0

### Minor Changes

- 8bbbe7e: Ship the production-ready workflow, dependency-injection, file-parsing, and upload runtime improvements together with their validated build and test tooling.

## 1.1.0

### Minor Changes

- 2b6380b: Minor updates

## 1.0.0

### Major Changes

- Initial release
