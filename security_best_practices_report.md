# Security best-practices review

## Executive summary

The local security review found no unresolved critical or high-severity vulnerability in the code paths exercised. This follow-up pass did identify and remediate high-severity authorization and stored-XSS paths; authentication, server-side authorization, cookie mutation origin checks, security headers, CSP, webhook signatures, MCP endpoint validation, encrypted secrets, and client/server secret separation are now locally verified.

The application now emits a compatible CSP baseline and CI includes a pinned OSV scan for `bun.lock`. External deployment security tooling still needs to be verified in the repository's GitHub environment.

The follow-up repo-wide audit found and fixed two additional application issues: workspace role managers could previously grant permissions they did not possess, and user-scoped API-key restrictions were not consistently applied across route helpers and durable AI execution. The audit also closed a stored-XSS navigation path caused by unvalidated message URLs.

## Follow-up findings fixed in this audit

### SEC-004 — Custom workspace roles could escalate privileges

- Status: Fixed.
- Severity: High before mitigation.
- Location: `apps/server/src/routes/workspace-roles.ts:64-78, 175-182, 222-230, 333-337`.
- Evidence: role creation, role edits, and member role assignment now require every granted permission to be held by the acting user and, when applicable, explicitly allowed by the API key.
- Impact: an admin could previously manufacture a custom role containing an owner-only action and assign it to another member.

### SEC-005 — API-key restrictions and organization-key identity were inconsistent

- Status: Fixed for the existing user-scoped API surface.
- Severity: High before mitigation.
- Location: `apps/server/src/lib/permissions.ts:330-342`, route permission helpers, `apps/server/src/middleware/auth.ts:55-73`, and durable workflow actor propagation in `apps/server/src/workflows/orchestrate/types.ts:3-9`.
- Evidence: direct user permission checks now accept and enforce API-key permissions; the request middleware rejects organization API keys from handlers that require a user identity; chat workflow state preserves the restriction into memory and GitHub tool checks.
- Impact: a restricted user API key could otherwise inherit the full organization role through direct helper calls, while an organization key could enter user-scoped handlers with no user identity.
- Follow-up: if organization API keys must call application routes, add a deliberate organization-scoped API surface with organization-principal authorization rather than re-enabling them in `requireAuth`.

### SEC-006 — User-controlled message URLs could become executable links

- Status: Fixed.
- Severity: High before mitigation.
- Location: `apps/server/src/lib/security/message-url.ts`, `apps/server/src/routes/chat.ts`, `apps/server/src/routes/messages.ts`, and the affected web navigation/preview components.
- Evidence: message URL fields accept only relative app paths, HTTP(S), data, or blob URLs at ingestion; client-side links and web previews further restrict navigation to relative app paths or HTTP(S).
- Impact: a crafted `javascript:` URL could previously be stored in a message/resource and executed when another chat member clicked it.

## Medium findings

### SEC-001 — CSP allows intentionally dynamic preview/image origins

- Status: Mitigated in application code; review during deployment hardening.
- Severity: Medium defense-in-depth consideration
- Location: `apps/web/next.config.ts` (`contentSecurityPolicy` and global headers)
- Evidence: the application now enforces `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, explicit script/connect origins, and sandbox-compatible `worker-src`/`frame-src` directives. `img-src` and `frame-src` intentionally allow HTTPS because the product supports external images and user-selected sandboxed web previews.
- Impact: the HTTPS allowances are broader than a fully enumerated allowlist. A future feature that introduces an unsafe active-content sink would still have less restrictive containment for those resource classes.
- Follow-up: inventory production image and preview hosts and narrow `img-src`/`frame-src` to explicit allowlists where the feature permits it. Keep the header at the edge as defense-in-depth.
- Mitigation: retain React escaping, sandbox the web preview iframe, and keep the existing clickjacking/type/referrer/permissions headers. The current `dangerouslySetInnerHTML` uses generated Shiki HTML and generated chart CSS rather than raw user HTML.

## Low findings / process gaps

### SEC-003 — Attachment serve URLs require a signed capability

- Status: Mitigated in application code and covered by unit tests.
- Severity: Medium before mitigation; defense-in-depth after mitigation.
- Location: `apps/server/src/lib/storage/file-access-token.ts`, `apps/server/src/routes/files/index.ts`, and `apps/server/src/lib/ai/attachment-context.ts`.
- Evidence: application-generated serve URLs include an HMAC token bound to the storage key and context. Production serving rejects missing or invalid tokens, and server-side attachment parsing only resolves signed relative chat URLs. Remote URLs are never interpreted as local storage keys.
- Impact addressed: an authenticated caller who guessed or supplied a storage key could otherwise reach the generic serve path or cause model-context parsing to read an unrelated local chat object.
- Follow-up: keep storage keys high-entropy and retain the existing authenticated route middleware; signed URLs are an additional capability boundary, not a replacement for object ownership policy.

### SEC-002 — Dependency scan requires external CI execution

- Status: Mitigated in repository configuration; pending first GitHub run.
- Severity: Low process verification gap
- Location: `.github/workflows/ci-application.yml` dependency scan step
- Evidence: CI now uses the pinned OSV Scanner action against `bun.lock`. Local `bun pm scan` cannot execute because Bun has no scanner configured, so the external action is the authoritative execution environment.
- Impact: a failing or misconfigured GitHub action could leave advisories unreported until its first run.
- Follow-up: require the first CI run to complete successfully, review any findings, and consider adding a scheduled full scan/Dependabot policy.
- Mitigation: the repository uses a committed lockfile and `bun install --frozen-lockfile`, which limits dependency drift.

## Verified controls

- Production auth cookie attributes are conditional: `secure` and partitioning are enabled in production and local HTTP remains usable (`apps/server/src/lib/auth.ts:1483-1489`).
- Cookie-authenticated unsafe API mutations enforce an allowed Origin/Referer; API-key and signed-webhook callers are handled separately (`apps/server/src/middleware/security.ts:25-83`).
- MCP endpoints are scheme-validated and production DNS/private-network checks are applied (`apps/server/src/lib/mcp/endpoint.ts:4-39`).
- Public workflow webhooks use encrypted secrets, HMAC/timing-safe verification, timestamp windows, body limits, and replay-safe delivery records (`apps/server/src/lib/webhooks/signature.ts:1-61`, `apps/server/src/routes/webhooks.ts:230-330`).
- Client-side secret-bearing dead modules were removed; no sensitive server environment references remain under `apps/web/src`.
- CI uses the lockfile, and the local Biome lint, package lint gates, Prettier check, typecheck, full tests, production build, migration graph, and readiness checks pass. The web ESLint gate exits cleanly with legacy warnings retained for follow-up cleanup.

## Scope limitations

This is an application-code and local-runtime review. It does not prove the production reverse proxy/WAF, TLS, secret manager, cloud storage policy, OAuth provider configuration, external email delivery, billing provider behavior, load capacity, alerting, backups, or rollback procedure. Those require staging/production credentials and deployment evidence.
