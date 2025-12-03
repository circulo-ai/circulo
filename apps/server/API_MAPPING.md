# API Mapping (Next.js -> Hono)

Tracking every existing Next.js API route under `apps/web/src/app/api` and where its Hono equivalent will live in `apps/server`. The `Status` column will be updated as endpoints are ported.

| Path | Methods | Purpose | Key dependencies | Status / Hono route |
| --- | --- | --- | --- | --- |
| `/api/agent` | GET, POST, PATCH, DELETE | List/create/update/delete organization agents | `agentRepo`, org membership + permissions, agent schema | Implemented (`src/routes/agent/index.ts`) |
| `/api/chat/[id]/agent` | GET, POST, PATCH, DELETE | Manage agents attached to a chat (enable/disable, custom instructions/temp) | `chatAgentRepo`, `agentRepo`, `chatRepo`, permissions | Implemented (`src/routes/chat-agents.ts`) |
| `/api/artifact` | GET, POST, DELETE | Fetch/update/create/delete artifacts with org access checks | `artifactRepo`, `chatRepo`, `isMemberOf` | Implemented (`src/routes/artifact.ts`) |
| `/api/auth/[...all]` | GET, POST | Better Auth handler passthrough | `auth.handler` | Implemented (`src/routes/auth.ts`) |
| `/api/auth/socket-token` | POST | Generate Better Auth one-time token for sockets | `auth.api.generateOneTimeToken` | Implemented (`src/routes/auth-socket-token.ts`) |
| `/api/auth/oauth/connections` | GET | List user OAuth connections/accounts | `db.account`, `db.user`, JWT decoding | Implemented (`src/routes/oauth/connections.ts`) |
| `/api/auth/oauth/credentials` | GET | Fetch credentials for provider or credential id with hybrid auth | `db.account`, `db.user`, `checkHybridAuth`, JWT decode | Implemented (`src/routes/oauth/credentials.ts`) |
| `/api/auth/oauth/disconnect` | POST | Remove OAuth accounts for current user | `db.account`, session | Implemented (`src/routes/oauth/disconnect.ts`) |
| `/api/auth/oauth/token` | GET, POST | Return/refresh access token for credential (hybrid auth aware) | `authorizeCredentialUse`, `refreshTokenIfNeeded` | Implemented (`src/routes/oauth/token.ts`) |
| `/api/auth/oauth/microsoft/files` | GET | List Excel/OneDrive files for credential | `db.account`, Graph API via refreshed token | Implemented (`src/routes/oauth/microsoft-files.ts`) |
| `/api/auth/oauth/microsoft/file` | GET | Fetch OneDrive file metadata | `db.account`, Graph API via refreshed token | Implemented (`src/routes/oauth/microsoft-file.ts`) |
| `/api/autumn/[...all]` | GET, POST | Autumn billing webhook/handler with identify customer | `autumnHandler`, `getActiveOrganizationId` | Implemented (`src/routes/autumn.ts`) |
| `/api/chat` | POST, DELETE | Create/send chat message + launch workflow; delete chat with permissions | `chatRepo`, `messageRepo`, `orchestrateWorkflow`, permissions | Implemented (`src/routes/chat.ts`) |
| `/api/chat/[id]/stream` | GET | Stream workflow run messages for chat | `workflow/api` stream | Implemented (`src/routes/chat-stream.ts`) |
| `/api/chat/[id]/pin` | POST | Toggle pin/unpin chat for user with ordering | `db.chatMember` | Implemented (`src/routes/chat-pin.ts`) |
| `/api/conversations` | GET | List conversation summaries for user | `chatRepo.getConversationSummariesByUserId` | Implemented (`src/routes/conversations.ts`) |
| `/api/files/delete` | POST | Delete file from storage (S3/Blob/local) | `uploads` utils + storage service | Implemented (`src/routes/files/delete.ts`) |
| `/api/files/download` | POST | Generate download URL (presigned or local) | `storage-service`, `getBaseUrl` | Implemented (`src/routes/files/download.ts`) |
| `/api/files/multipart` | POST | Multipart upload lifecycle (init/part URLs/complete/abort) | `uploads` providers (S3/Blob), session | Implemented (`src/routes/files/multipart.ts`) |
| `/api/files/parse` | POST | Parse file content from storage/local/URL | `file-parsers`, `uploads.StorageService`, validation | Implemented (`src/routes/files/parse.ts`) |
| `/api/files/presigned` | POST, OPTIONS | Single-file presigned upload (general/chat/kb/profile) | `storage-service`, `validateFileType`, session | Implemented (`src/routes/files/presigned.ts`) |
| `/api/files/presigned/batch` | POST, OPTIONS | Batch presigned upload generation | `storage-service`, `validateFileType`, session | Implemented (`src/routes/files/presigned-batch.ts`) |
| `/api/files/serve/[...path]` | GET | Serve/download file from storage (auth-aware) | `checkHybridAuth`, `storage-service`, `findLocalFile` | Implemented (`src/routes/files/serve.ts`) |
| `/api/files/upload` | POST, OPTIONS | Direct multipart form upload (general context) | `storage-service`, extension allowlist, session | Implemented (`src/routes/files/upload.ts`) |
| `/api/history` | GET, DELETE | List/delete chat history for org/user with pins | `chatRepo`, `chatMember`, `getActiveOrganizationId` | Implemented (`src/routes/history.ts`) |
| `/api/suggestions` | GET | Fetch suggestions for a document with ownership check | `suggestionRepo` | Implemented (`src/routes/suggestions.ts`) |
| `/api/users/me/profile` | GET, PATCH | Fetch/update current user profile (name/image) | `db.user`, zod validation, session | Implemented (`src/routes/users/profile.ts`) |
| `/api/users/me/settings` | GET, PATCH | Fetch/update user settings (telemetry/email prefs) | `db.settings`, session (optional) | Implemented (`src/routes/users/settings.ts`) |
| `/api/users/me/settings/unsubscribe` | GET, POST | Email unsubscribe flows with token verification | `email/unsubscribe` helpers, zod validation | Implemented (`src/routes/users/unsubscribe.ts`) |
| `/api/vote` | GET, PATCH | Get or set message votes (creator-only) | `voteRepo`, `chatRepo` | Implemented (`src/routes/vote.ts`) |
