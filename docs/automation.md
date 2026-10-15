# Automation execution and access

## Scheduling

The chat tools `scheduleTask` and `manageScheduledTasks` create, list, edit, pause and resume work in the current authorized chat. The automation page provides equivalent management controls. One-time schedules require a future ISO timestamp with an offset; intervals range from 10 seconds to one year; cron uses five fields and an explicit IANA time zone. Cron parsing uses cron-parser, including timezone and DST handling. The composer supplies the device time zone to the agent; unknown local times require clarification.

The scheduler polls every 15 seconds. A due occurrence advances its schedule, saves one prompt message and saves its dispatch intent in one database transaction. A stable message ID is the workflow idempotency key. An interrupted start retries the same intent and message; a durably created workflow has its own recovery worker. Invalid stored schedules become failed tasks rather than repeatedly blocking the queue.

Overdue recurring tasks run once when the server returns and calculate the next occurrence from the current time. They do not replay every missed interval. Local schedules require the desktop app/server to be running. This implementation does not wake a sleeping machine or install an OS scheduler. Results are posted to the destination chat; notification delivery is not advertised as an implemented feature.

Workspace permissions and active chat membership are checked when tasks are created, changed and dispatched. Original API-key scopes are retained in protected execution metadata and intersected with the key's current scopes. Revoked, expired or differently owned keys cannot dispatch new work. Role and chat-access changes can pause an automation. Access checks do not undo an action already in flight.

## Signed ingress

Webhooks require `automation:manage` and current access to their destination chat. A manager configures the instructions for each event. Incoming JSON is appended as untrusted data, not used as an authorization grant.

The endpoint is `/api/automation/webhooks/<id>/events`. Bodies are limited to 1,000,000 bytes while reading the stream. Send:

- `x-wf-timestamp`: Unix seconds or milliseconds, within five minutes of server time.
- `x-event-id`: a stable delivery identity of 1–255 characters.
- `x-wf-signature`: the hex HMAC-SHA256 of `timestamp.eventId.rawBody`, using the webhook's secret. An optional `sha256=` prefix is accepted.

**Compatibility change:** senders using the earlier `timestamp.rawBody` signature must include the event ID in the signing string. Retrying an event reuses its event ID and body; use a fresh timestamp/signature when retrying outside the original window.

Delivery identities have a unique database constraint. Failed starts reuse the same prompt and workflow identity, including after a worker restart. `202 Accepted` means dispatch was accepted, not that the agent's task has finished. Delivery history exposes the workflow ID and ingress errors. Completion is visible in the chat's workflow panel.

Signing secrets are encrypted in storage and returned only on creation or rotation. Rotation immediately invalidates the previous secret. The UI confirms rotation and deletion. GitHub, Slack and Telegram source labels describe events forwarded by adapters; their native webhook signing schemes are not accepted directly by this Circulo endpoint.

## MCP and human approval

Publication, enabled tools, applicable workspace/chat/agent links, agent allowlists and the actor's current MCP permission constrain tool availability. Scope grants are additive. An unrestricted workspace link grants every enabled tool; additional narrower links do not revoke that grant.

The official MCP client handles Streamable HTTP and legacy SSE, matching replies by request ID, paging discovered tools, cancellation and bounded operation timeouts. Requests retain endpoint validation and cannot redirect or forward credentials to another origin. This does not implement interactive OAuth for arbitrary MCP servers; credential references remain deployment-managed bearer credentials.

Tool names and descriptions identify the integration. Explicit Context7 requests select available Context7 tools before other sources can be substituted. This grants no access to disabled or unlinked integrations. Approval-required tools pause for a human decision. Access is checked again before executing the approved action. Atomic action claims prevent competing workers from executing it twice; an uncertain external result needs verification before retrying.

## Verification

Tests use real PostgreSQL-compatible transactions for dispatch recovery and webhook delivery identity, and real localhost HTTP/SSE servers for protocol behavior. They also cover scoped task tools, timezone/DST behavior, invalid input, cross-organization destinations, read-only API-key writes, role revocation, key expiry, scope intersection and webhook tampering. Scripted boundaries isolate model transport and authenticated principals in these tests. Live model/provider and packaged-runtime checks complement them; no claim of zero defects or comparative harness superiority is made.

## October 15 live verification

In the packaged Windows service, a UI-created webhook accepted one signed fixture event (202), returned the same delivery/workflow for a duplicate (202), and rejected a changed event ID using the old signature (401). Its response appeared in an already-open chat without a reload. Secret copying/rotation, pause/resume, delivery history and deletion-confirmation cancellation were exercised. The temporary secret file was removed.

A UI-created one-time task posted its response to the destination chat. Status-only updates preserve the scheduling zone, paused rescheduling updates the due time, and resuming an overdue paused one-time task keeps the original occurrence. These edge cases also have database integration coverage. Chat Copy ID was checked against the actual destination UUID.

Completed/failed workflows cannot authorize a stale approval. New failure projections cancel pending approvals. The parent workflow's overall execution deadline still bounds long human waits; an expired run needs an explicit continuation in chat.

Provider transport failures are preserved separately from recoverable tool errors. An unspecified agent response limit defaults to 8,192 output tokens; explicit agent settings remain authoritative. Provider credit/spending rejections produce an actionable message rather than a generic no-output error.
