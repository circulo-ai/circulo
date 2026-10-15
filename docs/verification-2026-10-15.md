# Local verification — October 15, 2026

## Build and regression checks

- Server: 45 test files, 190 tests passed; TypeScript passed.
- Web: 10 test files, 74 tests passed; TypeScript passed.
- Server production bundle and Next production build passed.
- Windows desktop directory packaging passed, including document-parser dependency checks. The final server bundle was copied into both the staging runtime and packaged runtime and checked by SHA-256 equality after the last server-only repair.
- `git diff --check` passed. Origin was fetched; master matched origin/master before the local audit commit. PR #114 is already in that history.

## Live checks

- Published Context7 resolved Better Auth, requested and received both configured human approvals, queried documentation, and returned two facts with source links. The panel advanced to its second approval without a reload and produced one final response. Its completed trace survived a reload.
- A saved report was read by exact title, returning the actual ID, three exact release requirements and fictional-source label. Its artifact preview displayed the saved Markdown.
- A UI-created one-time schedule delivered its response to an already-open chat without a reload. A chat tool also created a real one-time task. Pause preserved Asia/Tehran; rescheduling while paused changed the due time; the saved task survived desktop restart and resumed at its revised time.
- A signed webhook accepted a fixture event (202), returned the same delivery and workflow for its duplicate (202), and rejected a changed event ID using the old signature (401). The result appeared in its chat. Secret copying/rotation, pause/resume, delivery history and deletion-dialog cancellation were checked. The temporary secret file was removed, and the test webhook was left paused.
- Chat Copy ID copied the actual chat UUID. Separate chat tabs retained separate compose drafts.

## Failures corrected during the checks

Corrections cover stale approval traces, paused/failed state confusion, duplicate synthesis after approved MCP calls, stable assistant identities on reconnect, missing saved-document IDs, blank artifact rendering, schedule form state and hidden-field validation, timezone reset under partial updates, overdue one-time resume, paused rescheduling, shared drafts, and lost provider errors. A real provider credit rejection exposed the generic no-output error; the original rejection is now surfaced with a bounded default response limit. Recoverable tool errors remain recoverable.

The local test history intentionally retains earlier failed runs. Those messages describe earlier builds, not new test results.

## Scope and limits

Browser interactions used the packaged desktop's local service. Native Electron window interactions, OS microphone permission prompts, and physical-device recording/file-picker behavior were not manually controlled in this pass. This is a focused automation/MCP/harness pass, not certification that every feature in every runtime is defect-free.

Local schedules require the app/server to remain running. The scheduler does not wake the OS. Native GitHub/Slack/Telegram webhook signatures require a signing adapter. Approval waits remain bounded by the parent workflow's overall deadline. Real provider availability, credentials and credit limits still apply. Harness superiority has not been established by comparative benchmarks.

The earlier avatar palette findings were addressed by the intentional amber, emerald, slate, rose, stone and deep-teal palette. No manual design-hook suppressions were added.
