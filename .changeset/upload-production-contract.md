---
"@circulo-ai/upload": major
---

Add exact-key and create-only S3 presigning, metadata and bounded range reads,
encryption, public signing endpoints, network limits and managed shutdown. Add
signed local transfers with atomic create-only storage and MIME metadata. Isolate
optional SDK loading and expose provider/core subpaths with ESM/CJS declarations.

Harden client completion by requiring an application verification hook before
business callbacks. Reject cross-platform filesystem aliases and unsupported
write guarantees, bound buffered downloads, and protect Azure multipart sessions.
See packages/upload/PRODUCTION.md for upgrade responsibilities and qualification.

Add an optional tRPC 11 adapter with composable typed resolvers, bounded Zod
schemas, required authorization, verified completion and safe error mapping.
Separate capability contracts, route builders and policy modules; move all tests
outside source, add API inference checks and bound ordered batch concurrency.
Require Node 22 or newer and patched AWS/FTP peers; make Vercel Blob an optional
peer so unused provider SDKs are neither installed nor loaded by the core package.
