## Overview
- Remove workspace/workflow assumptions and authorize credential use strictly by credential ownership and trusted internal calls.
- Keep the current schema-centric approach: credentials live in `account` tied to `user.id`.

## Current State
- `authorizeCredentialUse` (`web/src/lib/auth/credential-access.ts:26`) authenticates then defers to TODO blocks assuming `workflow`/`workspace`.
- Auth types implemented: `session` and `internal_jwt` via `checkHybridAuth` (`web/src/lib/auth/hybrid.ts:22`). `api_key` is part of the type union but not implemented.
- Credentials are OAuth accounts stored in `account` (`web/src/db/schema/auth.ts`). Utilities already enforce owner checks (e.g., `getCredential` in `web/src/app/(auth)/api/auth/oauth/utils.ts:48`).

## Proposed Rules
- Session: allow only if `auth.userId === account.userId`.
- Internal JWT: allow for system-side operations without user context if the credential exists; return `credentialOwnerUserId` for downstream use.
- No collaboration path without explicit team/org permissions; return `Unauthorized` when a non-owner session attempts access.
- Remove `workflowId` requirement and related TODOs; do not introduce `workspace`/`workflow` concepts.

## Code Changes
- `web/src/lib/auth/credential-access.ts`
  - Keep the initial auth and credential-owner lookup (`lines 40–59`).
  - Owner fast-path remains (`lines 60–71`).
  - Replace the TODO sections (`lines 78–120`) with:
    - If `auth.authType === "internal_jwt"`: return `{ ok: true, authType, requesterUserId: auth.userId, credentialOwnerUserId }`.
    - Else: return `{ ok: false, error: "Unauthorized" }`.
  - Remove `workflowId` gating; delete `workflowId` checks (`lines 73–76`) as they are no longer needed.
- `web/src/lib/auth/hybrid.ts`
  - Update docstring to reflect that `workflowId` is not required; clarify supported auth types: session and internal JWT.

## Security Considerations
- Internal JWT uses `env.INTERNAL_API_SECRET` (`web/src/lib/auth/internal.ts:9`); treat as trusted service-to-service channel.
- Owner-only access prevents cross-user credential misuse via web requests.
- Optional future hardening: require an `x-user-id` header for internal calls and verify it matches `credentialOwnerUserId` if you want stricter coupling.

## Validation
- Unit-test `authorizeCredentialUse` behavior with mocked `NextRequest`:
  - Session owner → `ok: true`.
  - Session non-owner → `ok: false`, `error: "Unauthorized"`.
  - Internal JWT with existing credential → `ok: true`.
- Integration sanity: exercise existing utilities (`getCredential`, `refreshAccessTokenIfNeeded`) since they already enforce ownership.

## Future Extensions
- If/when introducing org/team permissions, add a simple permission helper against `organization/member` tables to enable collaboration.
- If adding API keys, extend `checkHybridAuth` to resolve user from the key and reuse the same owner-only rule.