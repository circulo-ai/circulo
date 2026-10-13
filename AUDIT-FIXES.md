# Repository audit and fixes

Audit of the `circulo-ai` monorepo, covering ~151k lines of TypeScript across
`apps/web`, `apps/server`, `apps/desktop` and the ten workspace packages.

- **Round 1** (from `949cc28`) — findings 2.1–2.9, landed as `09ea11d`.
- **Round 2** (from `09ea11d`) — everything in §3, on branch
  `chore/audit-remediation-round-2`.

The audit ran the repository's own quality gates (lint, typecheck, test, build,
format) plus static analysis for dead code, duplication, suppressed
diagnostics, security-boundary configuration and log hygiene.

---

## 1. Headline

**Three of the four quality gates were not enforcing anything.** All five now
pass and all five are wired into CI.

| Gate                   | Before the audit                                                      | Now                                                                                |
| ---------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `bun run lint:check`   | **Crashed** — binary not found. Even when run, 0 rules were enabled.  | Passes. Biome recommended set active; 16 rules explicitly off, each with a reason. |
| `bun run typecheck`    | Passed, but 1 777 lines of auth code were excluded via `@ts-nocheck`. | Passes with **no suppressions anywhere** in the repository.                        |
| `bun run test`         | Failed intermittently (~2 in 3 full runs) on a hanging test.          | Passes. 13 tasks, includes `apps/web` for the first time.                          |
| `bun run format:check` | Failed on **1 114 of 1 114 files**.                                   | Passes, and is now a CI step.                                                      |
| `bun run build`        | Passed.                                                               | Passes.                                                                            |

The most consequential functional finding was **2.1**: production server logging
was disabled outright, silencing 196 log calls across 35 modules.

---

## 2. Round 1 — committed in `09ea11d`

### 2.1 Production server logging was entirely suppressed — High

`apps/server/src/lib/logs/console/logger.ts`

`shouldLog()` returned `false` for every level whenever `NODE_ENV=production`:

```ts
// In production, only log on server-side (where window is undefined)
if (ENV === "production") {
  return false;
}
```

The comment describes the intent correctly, but the implementation dropped the
`window` condition. The near-identical web copy still has it, so this was a
copy-paste regression in the server twin, not a design decision. Because the
server never has a `window`, the branch matched unconditionally.

**Impact.** Every `logger.debug/info/warn/error` call was a no-op in production
— **196 call sites across 35 modules**, including the workflow runtime, auth,
billing and the scheduler. `LOG_LEVEL` and `LOG_CONFIG.production.minLevel`
were both dead config. A production incident would have left no
application-level trace.

**Fix.** The server logger only ever runs server-side, so the branch has no
valid meaning there and was removed; production logging is governed by
`config.minLevel` (`ERROR` by default, overridable with `LOG_LEVEL`). Mirroring
the web guard was the first attempt and does not compile — `apps/server`
builds with `lib: ["ES2022"]` and no DOM lib, which is further confirmation the
condition was never meaningful on the server.

### 2.2 Hanging test in the workflow security suite — High (CI reliability)

`packages/wf/test/security.test.ts`

Two tests synchronised on a single macrotask (`setTimeout(resolve, 0)`) before
publishing an event. Both gateways only call `eventBus.subscribe()` _after_
awaiting `tokens.verify(token)`, and both in-memory buses drop events published
with no subscriber (`if (!callbacks) return;`). When the event landed first it
was lost permanently and the pending `iterator.next()` **never settled** — the
test hung until the suite timeout rather than failing fast.

Raising `testTimeout` does not help a promise that never resolves; a 30s
timeout still hung. **Fix:** a `trackSubscription()` helper that resolves when
the bus subscription is actually registered, replacing both `setTimeout(0)`
calls with `await subscribed`.

### 2.3 Lint gate did not run, and enforced nothing when it did — High

Two independent defects: `@biomejs/biome` was declared only in `apps/server`
and `packages/upload`, so the root scripts' hard-coded
`./node_modules/@biomejs/biome/bin/biome` path did not exist; and `biome.json`
set `linter.rules.recommended: false` with no rule enabled, so Biome checked
1 106 files and reported nothing.

**Fix.** Added `@biomejs/biome` to the root `devDependencies` (2-line lockfile
delta) and set `recommended: true`. See §3.2 for how the resulting backlog was
cleared.

### 2.4–2.9 Remaining round-1 fixes

| Item                                | Location                             | Change                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format:check` failed on every file | repo root                            | No `.gitattributes` existed; with `core.autocrlf=true` the checkout is CRLF while Prettier wants LF. Added `* text=auto eol=lf` plus binary markers.                                                                                                                                                           |
| Production CORS trusted loopback    | `apps/server/src/app.ts`             | `allowedOrigins` always included `localhost:3000/3001` and `127.0.0.1:3000` with `credentials: true`, letting any process on those ports make credentialed calls to a production API. Now spread only when `NODE_ENV !== "production"`.                                                                        |
| Electron exposed its IPC bridge     | `apps/desktop/src/main.cjs`          | `setWindowOpenHandler` allowed **any** `https://` URL to open a child window, which inherits the preload and therefore `downloadUpdate`/`installUpdate`. There was no `will-navigate` handler at all. Now denies and defers to `shell.openExternal`, with a navigation allowlist via `isLocalRuntimeUrl()`.    |
| Latent switch fallthrough           | `packages/upload/src/routes/next.ts` | `case "multipart":` could fall through into `case "upload":`. Unreachable only because a Zod schema throws first. Added an explicit `return notFound()`.                                                                                                                                                       |
| Stale syntax highlighting           | `apps/web/.../code-block.tsx`        | An inverted mount guard meant a superseded highlight run could win and pin stale output, and the cleanup _enabled_ `setState` after unmount. Replaced with a `cancelled` flag and added the missing `.catch()`.                                                                                                |
| Smaller cleanups                    | various                              | Swallowed E2B sandbox-kill failure; `localhost:3001` dev fallback; three `User-Agent: sim-studio` headers; a 48-line commented-out example block; a duplicate object key; three `==`; an empty destructuring pattern; a stale `bun.lock` (`packages/upload` recorded at 1.7.0 against a 2.0.0 `package.json`). |

---

## 3. Round 2 — the deferred items, now done

### 3.1 `@ts-nocheck` removed from the auth boundary — was High

`apps/server/src/lib/auth.ts` had a file-level `// @ts-nocheck` excluding
**1 777 lines** — the Better Auth configuration, access-control statements and
every OAuth provider — from a `strict` + `noUncheckedIndexedAccess` project
whose typecheck gates CI. Removing it produced **70 errors**. All 70 are fixed
and the pragma is gone; there is now no `@ts-nocheck`, `@ts-ignore` or
`@ts-expect-error` anywhere in `apps/server` or `apps/web`.

**One root cause explained 12 of the errors.** The OAuth provider array is
consumed by `.filter(...)`, which stops `GenericOAuthConfig[]` from reaching
the array literal as a contextual type. So `prompt: "consent"` widened to
`string`, the array stopped matching the plugin option (TS2322), and _every_
`getUserInfo(tokens)` parameter silently degraded to `any` (11 × TS7006). A
`satisfies GenericOAuthConfig[]` annotation restores the contextual type and
all 12 errors disappear together. This is now commented in place, because it
looks removable and is not.

**The 48 `unknown` errors were unvalidated identity-provider responses.**
`Response.json()` is `unknown`, and the connectors read straight through it:

```ts
const profile = await profileResponse.json(); // unknown
if (!profile.email) {
  /* ... */
} // unchecked
```

Added Zod schemas for every provider response the file consumes — GitHub
(profile and emails), X, Atlassian (shared by Confluence and Jira), Discord,
Notion, Reddit and Linear's GraphQL viewer — parsed before use. Fields the
connector already treated as optional stay optional, so a provider shape change
raises inside the existing try/catch and declines the sign-in rather than
building a half-populated account. The GitHub branch also stopped mutating its
parsed profile in favour of local `email`/`emailVerified` variables.

**Two real crashes surfaced once the file was type-checked.** Supabase and
Slack both decoded an ID token with `Buffer.from(idToken.split(".")[1], ...)`.
Under `noUncheckedIndexedAccess` that index is `string | undefined`, and a
token with no `.` separator reached `Buffer.from(undefined)` and threw. Both
now share a `readIdTokenSubject()` helper that returns `undefined` for anything
malformed and validates that `sub` is a non-empty string.

The remainder: `User` was used as a type but never imported, so
`createPersonalOrganization` now declares the `{ id, name }` it actually needs
(which also removed a `session.user as User` cast); `HeadersInit` is not in
scope without a DOM lib, so there is now a `HeaderSource` type derived from
`ConstructorParameters<typeof Headers>`; `SessionResponse` declares the
`activeOrganizationId` and `apiKeyPermissions` that the organization plugin and
API-key path really populate but `Auth<BetterAuthOptions>` erases, which also
removed two `as any` casts at the call sites; and a `personalOrg[0]` access is
now destructured.

Two casts remain, deliberately, as `as unknown as SessionResponse`: the
API-key branches of `getSession` return a partial session with no session row
behind it. That is pre-existing behaviour, the assertion is now explicit and
commented rather than silently unsound, and reshaping the session model is a
larger change than this pass should decide.

### 3.2 Lint backlog — 715 violations across 42 rules, now 0 errors

Enabling `recommended: true` surfaced 347 errors, 458 warnings and 96 infos.
That is now **zero errors and zero infos**, with 33 warnings left on one rule.
Rules explicitly disabled went from 42 to **16**.

Fixed, by category:

- **Dead bindings (33)** — `noUnusedVariables`, `noUnusedFunctionParameters`,
  `noUnusedPrivateClassMembers`. Mostly cruft, but two were abandoned features:
  `MAX_ERROR_RETRIES`/`errorRetryCount` in the settings store (only ever reset,
  never incremented or compared), and `workflowStatus` in `chat.tsx`, whose
  setter is called 13 times while the value is never read — workflow progress is
  tracked and never rendered. Props that are part of a public component shape
  were marked `_unused` rather than removed.
- **Mechanical/stylistic** — `useImportType` (142, material here because
  `verbatimModuleSyntax` is on), `useNodejsImportProtocol`, `useTemplate`,
  `useExponentiationOperator`, `useShorthandFunctionType`, `useConst`, and five
  `complexity/*` rules.
- **Real bug classes** — `noDuplicateObjectKeys`, `noFallthroughSwitchClause`,
  `noDoubleEquals`, `noEmptyPattern` (round 1); `useIterableCallbackReturn`
  (including a `.map()` used purely for side effects), `noImplicitAnyLet`,
  `useParseIntRadix`, `noGlobalIsNan`, `noAccumulatingSpread`.
- **Accessibility — 233 down to 0 errors.** `useButtonType` (8) was the real
  defect: a `<button>` with no `type` defaults to `submit` and submits any
  enclosing form. `noLabelWithoutControl` (10) turned out to be a false
  positive — those labels _do_ wrap their control, but it is a Radix
  `Checkbox`, which the rule cannot see through; it is now configured with the
  project's `inputComponents`. `role="status"` on a `<div>`/`<p>` became
  `<output>`, and an `aria-label` that would have masked visible "Upload
  failed" text was removed. `apps/web/src/components/ui/**` and
  `components/ai-elements/**` are vendored upstream and exempted by a
  `biome.json` override, since patching their markup would be lost on the next
  re-generation. The five genuinely-justified cases carry inline
  `biome-ignore` comments with reasons: a decorative blur overlay, two
  user-uploaded media previews with no caption track to attach, and a
  click-to-clear region whose accessible control is the `<input type="file">`
  its enclosing `<label htmlFor>` already points at.

**Three of Biome's own fixes had to be reverted**, which is worth recording
because it is the argument against running `--write --unsafe` over a codebase
unattended:

1. `useLiteralKeys` rewrites `obj["x"]` to `obj.x`, which `packages/wf` and
   `packages/wf-cli` forbid via `noPropertyAccessFromIndexSignature`. The two
   cannot both hold; the tsconfig setting is the stricter one, so the rule is
   off.
2. `noConfusingVoidType` rewrote a `RouteHandler` return type from
   `Promise<Response | void> | void` to `... | undefined`, which is no longer
   assignable from Hono's `MiddlewareHandler`. Rule off.
3. `useExhaustiveDependencies` — see below.

### 3.3 Dead security module removed — was Medium

`apps/server/src/lib/security/input-validation.ts` was 782 lines and 16
exported validators with **zero importers**. The decision the audit left open
resolved itself on inspection: the live SSRF guard, `validateMcpEndpoint`, is
strictly stronger than the dead `validateExternalUrl` — it resolves DNS and
checks the answers (so it also covers rebinding), handles cloud metadata
endpoints, and covers far more reserved ranges. The dead validators were
inferior duplicates of code already in use, so the file is deleted.

The one concrete gap it would have covered is fixed directly:
`e2b.ts` logged the **full user-supplied source** at `info`. Harmless while
production `minLevel` is `ERROR` — but fix 2.1 made that reachable, so an
operator setting `LOG_LEVEL=info` would have written arbitrary user code to the
logs. It now logs `codeLength` instead of `code`. A sweep for other logged user
content and secrets found none: the remaining candidates are DI service tokens
at `debug` and a rate-limit key at `warn`.

### 3.4 Structured logging adopted — was Medium

27 of the 31 raw `console.*` calls in `apps/server/src` are migrated to
`createLogger`, across 14 modules including the global error handler in
`app.ts`, the chat and webhook routes, the scheduler, and the workflow
runtime. `routes/test.ts` reuses the `ConsoleLogger` it already owned rather
than taking a second logging path, and `app.ts` names its instance
`appLogger` because `logger` is already Hono's request-logging middleware
there.

The four remaining `console.log` calls are in `index.ts` and `node-server.ts`
and are left deliberately, with a comment: they are the process talking about
its own startup and shutdown, they must appear whatever `LOG_LEVEL` is set to,
and the logger defaults to `ERROR`-only in production.

### 3.5 `apps/web` has tests — was Medium

The largest surface in the repository (73 753 lines) had no test script and no
tests. It now has `vitest.config.ts`, a `test` script, and **19 tests** that
run in the turbo pipeline and therefore in CI.

Two things had to be solved to get there, both worth knowing about:

- A `{ find: "@" }` alias is a prefix match, so it also rewrites scoped package
  names like `@t3-oss/env-nextjs` into the source tree. The alias is anchored
  as `/^@\//`. (`apps/server/vitest.config.ts` has the same unanchored pattern;
  it has not bitten yet.)
- zod 4 lists a non-standard `@zod/source` export condition first, and Vite
  resolves it to the package's TypeScript source — which exports the core
  primitives but **not** the `z` namespace, so any web module importing
  `{ z }` saw `undefined`. Since most of `apps/web` validates with zod, this
  would have blocked almost any future test. The config pins the published ESM
  entry via `require.resolve("zod")`.

First coverage went to what the audit named: `lib/api/client.ts` (11 tests —
status-to-code mapping, 204, non-JSON responses, validation-error details,
transport failure, and body/content-type handling for JSON, `FormData`,
caller-set content types and no body) and `lib/urls/utils.ts` (8 tests,
including a regression test for the `localhost:3001` fallback fixed in round 1).

### 3.6 Tests no longer need a database — was Low

`provider-registry.test.ts` and `agent-loop-state.test.ts` failed collection
with `Missing DATABASE_URL`. The cause was not the tests: `packages/db/index.ts`
ended with

```ts
export const db = getDb();
```

which **opened a connection pool as a side effect of importing the package**.
Any module that merely referenced a table dragged in a live database. `db` is
now a lazy `Proxy` that creates the pool on first real use, so importing the
package is free. All 26 server test files (79 tests) now pass with no
`DATABASE_URL` set.

### 3.7 Env access validated — was Low

Nine variables were read via `process.env` while being in neither the schema
nor `.env.example`: `S3_BUCKET`, `S3_KB_BUCKET`, `S3_ORG_BUCKET`,
`S3_CHAT_BUCKET`, `S3_PROFILE_PICTURES_BUCKET` (legacy aliases still honoured
as fallbacks by `lib/storage/config.ts`), `AWS_REGION`, `PORT` and `HOSTNAME`.
All are now declared in `apps/server/src/lib/env.ts` and documented in
`.env.example`, and the reads go through `env`.

Four reads stay on `process.env`, each now commented, because `@t3-oss/env`
**snapshots `process.env` at import**: the three production security gates in
`lib/mcp/endpoint.ts`, `routes/ai-providers.ts` and `routes/files/index.ts`
should reflect the live environment, and `lib/storage/file-access-token.ts`
resolves its signing secret per call so it stays late-bound. Routing them
through `env` broke two existing tests, which is the same fact from the other
direction. Every variable involved is still in the schema, so production boot
validation covers them.

### 3.8 Duplicated modules resolved — was Low

`lib/execution/languages.ts`, `lib/execution/constants.ts` and `lib/usage.ts`
now live in `packages/types` (as `execution.ts` and `usage.ts`) and both apps
import them from there. `AppUsage` in particular is a wire-format type — the
server emits `usage:` chunks the web consumes — so two copies were a real drift
risk.

`lib/ai/prompts.ts` needed no shared home: **web's copy was entirely dead**, 126
lines with zero importers and zero references to any of its eight exports,
while the server's copy is live. Deleted rather than shared.

Sharing `usage.ts` needed one real fix: it imported `UsageData` from
`tokenlens/helpers`, which only re-exports it from `@tokenlens/helpers/context`.
That resolved in the apps by hoisting but not in a leaf package depending on
`tokenlens` alone, so `packages/types` now depends on `@tokenlens/helpers`
directly and imports from the subpath that actually declares the type.

### 3.9 Formatting normalised and gated — was Low

`bun run format` normalised the repository (the line-ending cause was fixed in
round 1), `format:check` now passes, and a **Check repository formatting** step
runs in `ci-application.yml` before lint.

### 3.10 TODOs — was Informational

The 62 TODOs are genuine backlog, not defects, and are left as their authors
wrote them. One was a defect in itself: `apps/web/src/app/layout.tsx` cited a
private ChatGPT conversation URL as documentation, which no other reader can
open. Replaced with a description of the intent.

---

## 4. Still open

### 4.1 `useExhaustiveDependencies` — 33 warnings, rule set to `warn`

This is the one item deliberately not closed, and the reason is specific:
**Biome's automated fix for it introduced behavioural regressions in eight
files**, which I caught and reverted. Examples, all from the autofix:

- `packages/wf/src/react.ts` — `eventTypesKey` (a string key derived from the
  array contents, so an inline array literal does not churn the dependency)
  was renamed `_eventTypesKey` and replaced in the dependency array with
  `eventTypes` itself. Inline arrays get a new identity every render, so the
  event subscription would be torn down and rebuilt on every render.
- `glass-surface.tsx` — three effects had their dependencies replaced with
  `updateDisplacementMap`, which is a plain function declared in the component
  body, not a `useCallback`. New identity every render, and one of those
  effects calls `setTimeout(updateDisplacementMap, 0)`.
- Real triggers were **removed**: `chatId` from `multimodal-input.tsx` and
  `use-message-pagination.ts`, `id` from `chat.tsx`, `artifact.documentId` from
  `artifact.tsx`, `selectedTag` from `faq-list.tsx`. Pagination would not reset
  when switching chats.
- `activeIndex` was **added** to an `IntersectionObserver` effect in
  `use-active-by-class.ts`, which would recreate the observer on every
  intersection.

None of that is caught by typecheck or lint, and until §3.5 there were no web
tests at all. So: the rule is enabled at `warn` (visible on every lint run,
does not gate CI), and the five dependencies React _guarantees_ are stable —
`useState` setters and `useRef` objects — were removed by hand. The remaining
33 need per-site judgement with test coverage behind them, which is the natural
follow-on to §3.5.

### 4.2 16 lint rules still off

Each is off for a stated reason, not by omission:

| Rule                                                                                                                                     | Count | Why                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suspicious/noExplicitAny`                                                                                                               | 244   | Largest single item. Concentrated in `packages/di` and `packages/file-parsers`, where some is legitimate metaprogramming. Worth a dedicated pass. |
| `a11y/noSvgWithoutTitle`                                                                                                                 | 183   | Almost entirely `icons.tsx`, a 5 014-line icon catalogue. Decorative icons do not need titles; the rule has no per-file nuance.                   |
| `suspicious/noControlCharactersInRegex`                                                                                                  | 22    | Needs review — plausibly intentional in sanitisation regexes, but each should be confirmed rather than bulk-changed.                              |
| `suspicious/noArrayIndexKey`                                                                                                             | 17    | React reconciliation bugs on reorder. Needs a stable key per call site.                                                                           |
| `performance/noImgElement`                                                                                                               | 11    | Prefers `next/image`; several are deliberate (including one with an existing `eslint-disable`).                                                   |
| `complexity/useLiteralKeys`                                                                                                              | 47    | Conflicts with `noPropertyAccessFromIndexSignature` in `packages/wf` and `packages/wf-cli`.                                                       |
| `suspicious/noShadowRestrictedNames`, `complexity/noArguments`, `noBannedTypes`, `noStaticOnlyClass`, `suspicious/noAssignInExpressions` | 20    | Intentional patterns in the DI container and its tests.                                                                                           |
| `security/noDangerouslySetInnerHtml`                                                                                                     | 3     | All three reviewed and safe: two are escaped Shiki output, one is `chart.tsx` CSS variables.                                                      |
| `suspicious/noConfusingVoidType`                                                                                                         | 5     | Its fix breaks middleware return-type assignability (§3.2).                                                                                       |
| `suspicious/noDocumentCookie`                                                                                                            | 1     | Vendored shadcn sidebar persisting its own state.                                                                                                 |
| `suspicious/noThenProperty`                                                                                                              | 2     | `packages/wf` class builder.                                                                                                                      |
| `style/noNonNullAssertion`                                                                                                               | —     | Pre-existing choice, not introduced here.                                                                                                         |

### 4.3 Smaller notes

- The two `as unknown as SessionResponse` casts in `getSession` (§3.1) reflect
  a session model where an API key produces a partial session. Reshaping it
  touches 25 `SessionResponse` references and should be its own change.
- `apps/server/vitest.config.ts` has the same unanchored `{ find: "@" }` alias
  that broke the web test setup (§3.5). It has not caused a failure yet.
- `apps/web/package.json` has `"lint": "eslint"` alongside `eslint.config.mjs`,
  while the repository gate is Biome. Two linters, one of them unreferenced by
  CI.
- Untested packages remain: `packages/db` (5 653 lines, the repository layer),
  `packages/core`, `packages/file-parsers`, `packages/redis`.

---

## 5. Verification

Every gate below was run after the final change.

```bash
bun install
bun run format:check   # passes
bun run lint:check     # passes — 0 errors, 0 infos, 33 warnings on one rule
bun run typecheck      # passes — 17/17 tasks, no type suppressions anywhere
bun run build          # passes — 10/10 tasks
```

Tests pass with or without a database (§3.6); CI sets one:

```bash
DATABASE_URL="postgres://user:password@localhost:5432/circulo" bun run test
```

Test stability for §2.2 was confirmed with three consecutive forced full runs,
each green, against a baseline that failed 2 of 3:

```bash
DATABASE_URL="..." bun ./node_modules/turbo/bin/turbo run test --force
```

### Totals

|                   | Round 1 (`09ea11d`)            | Round 2                        |
| ----------------- | ------------------------------ | ------------------------------ |
| Files changed     | 133 + 1 new                    | 140                            |
| Lines             | +357 / −270                    | +1 857 / −2 186                |
| Type suppressions | 1 (`@ts-nocheck`, 1 777 lines) | **0**                          |
| Lint rules off    | 42                             | **16**                         |
| Lint errors       | 347                            | **0**                          |
| Tests             | 12 tasks, 0 in `apps/web`      | 13 tasks, **19** in `apps/web` |

Files removed (all verified unreferenced): `lib/security/input-validation.ts`
(782 lines), web's `lib/ai/prompts.ts` (126 lines), and six duplicate
`lib/execution/*` and `lib/usage.ts` copies now shared from `packages/types`.

Round 2 is committed on `chore/audit-remediation-round-2`.

### Suggested next steps

1. **§4.1** — work the 33 hook-dependency warnings per site, with web tests
   (§3.5) as the safety net. Do not run the autofix over them.
2. **§4.2** — `noExplicitAny` in `packages/di`/`packages/file-parsers`, then
   `noArrayIndexKey` and `noControlCharactersInRegex`.
3. **§4.3** — anchor the `apps/server` vitest alias; decide whether `apps/web`
   keeps ESLint alongside Biome.
4. Extend tests to `packages/db`, the largest untested package.
