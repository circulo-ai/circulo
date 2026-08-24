# Security best-practices review

## Executive summary

The local security review found no confirmed critical or high-severity vulnerability in the code paths exercised. Authentication, server-side authorization, cookie mutation origin checks, security headers, CSP, webhook signatures, MCP endpoint validation, encrypted secrets, and client/server secret separation are implemented and locally verified.

The application now emits a compatible CSP baseline and CI includes a pinned OSV scan for `bun.lock`. External deployment security tooling still needs to be verified in the repository's GitHub environment.

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
- CI uses the lockfile, and the local Biome lint, typecheck, full tests, production build, migration graph, and readiness checks pass.

## Scope limitations

This is an application-code and local-runtime review. It does not prove the production reverse proxy/WAF, TLS, secret manager, cloud storage policy, OAuth provider configuration, external email delivery, billing provider behavior, load capacity, alerting, backups, or rollback procedure. Those require staging/production credentials and deployment evidence.
