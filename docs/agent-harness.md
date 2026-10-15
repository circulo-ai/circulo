# Agent execution harness

## Supported work

The harness supports tool-based research, chat attachments, knowledge bases, document artifacts, memory, connected services, and workflows. Tools retain their existing workspace, chat, account, and API-key restrictions. Harness controls do not grant external access.

Both the default assistant and specialist agents use the same runtime. For multi-step work, an agent creates a durable checklist with completion criteria and dependencies. Only one checklist task runs at a time within an execution; independent specialist executions can still run in parallel. Requirements cannot disappear during replanning, and completed requirements are immutable.

Tool-backed tasks need successful results from the named tools in that execution. Pending approvals and returned errors are not success evidence. A separate model call audits planned work against the original goal and observed results. Missing requirements become new checklist tasks and keep the tool loop running. Reviews are limited to three; unavailable or inconclusive verification produces an incomplete result.

Response-only checks depend on model judgment. Tool success proves an operation returned successfully, not that every semantic claim is correct. The completion auditor is an additional check, not a formal proof system.

## Sources and deliverables

- `readChatAttachment` reads extracted text in bounded pages from attachments already present in the authorized conversation. It does not fetch arbitrary remote URLs.
- `readDocument` reads saved artifacts owned by the acting user or in the authorized chat. Agents can verify content after writing it.
- `createDocument` accepts an exact researched draft, preserving its contents instead of generating a separate draft from the title.
- `readExecutionEvidence` restores saved tool output in pages when it has been abbreviated in model context.
- Internet research requires an available connected tool or MCP service. The harness does not invent browsing access or bypass provider setup.

## Durability and recovery

The workflow event journal stores the goal, checklist revisions, model-step response messages, tool outcomes, and completion reviews. Model steps resume from their saved context. Completed actions that were not yet acknowledged in a model checkpoint are replayed from saved evidence rather than executed twice.

Operation claims fence competing workers, including regenerated model tool-call IDs. Uncertain writes are not retried automatically because the action may already have happened. A user or an authoritative tool must establish the outcome before a new action is appropriate.

After an approved MCP action succeeds, its pending observation is replaced by its real result. Execution continues with the remaining requirements, and the approved action is not repeated. Approval wait time is excluded from the harness's active deadline; the parent workflow still has its overall execution limit.

An explicit “continue,” “resume,” “keep going,” or “carry on” can inherit a blocked execution's goal, checklist, and evidence into a new run. This is limited to the same acting user, agent, organization, and authorized chat. Current tool permissions are resolved again. Completed work is retained, and the new user turn grants a fresh execution budget.

## Bounds and stopping

Default execution limits are 40 model steps, 120 external tool calls, 250,000 accounted tokens, 10 minutes of active execution, and a 120,000-character model context budget. Identical external calls are bounded to three attempts. Control calls consume model-step and token budgets. Completion reviews also consume tokens and provider quota.

Oversized tool output is abbreviated with an evidence pointer. Old conversation groups are removed together with their tool-call/result pairs; the latest request and execution checklist remain available. Saved evidence is limited to 1 MiB per result; tools should use paginated retrieval.

The specialist coordinator retains its four-iteration, twelve-agent-task, and 25-minute bounds. The final allowed iteration is evaluated. Reaching a limit never proves goal completion. Initial work is rejected if its budget has already expired. Failed tasks can receive one controlled retry; successful tasks are not repeated by the progress controller.

Workflow cancellation is propagated to model generation, and action guards prevent additional tool calls. Cancellation cannot undo an external action already in flight. Token accounting uses all completed SDK steps, and provider cost is summed across steps when authoritative cost is available. Metering identities distinguish assigned tasks and approval continuations.

## User interface

The workflow panel shows requirements checked, individual task status, completion checks, evidence counts, missing-work explanations, action/step totals, and completion reviews. The same checklist is restored after a reload from the durable trace. Completed workflow panels collapse by default while preserving explicit user choices.

## Verification and comparison

The automated scenarios cover a seven-step research → write → readback → completion pipeline, missing-work replanning, unavailable review, cancellation, approval continuation, explicit user continuation, competing workers, worker recovery, uncertain side effects, context reduction, iteration exhaustion, and final-iteration verification. Some scenarios use a scripted model to isolate runtime behavior; these are not measurements of real-world model quality.

The design draws on [Anthropic's long-running harness guidance](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [OpenAI's description of the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/), and [Hermes's context management](https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching). No controlled benchmark against those products has been performed, so superiority is not claimed.

Comparative evaluation should hold model, tools, task set, permissions, and budget constant, then measure verified deliverable completion, false completion, duplicate side effects, recovery success, latency, and cost. External service correctness and model reasoning quality remain part of the end-to-end result.

## October 15 runtime checks

The packaged Windows runtime completed a live Context7 library-resolution → approval → documentation-query → approval → cited response flow. MCP action results remain execution evidence rather than independent agents requiring a second synthesis. Approval waits have a paused state; the latest durable trace replaces earlier approval snapshots. Reconnects reuse a database-compatible stable assistant UUID.

A saved report was read back by exact title in its authorized chat, returning its real ID and the three source requirements. Exact-title ambiguity returns candidate IDs rather than choosing silently. Successful document tool results supply an authoritative saved-ID footer if the final model text omits identifiers. Saved Markdown now uses a synchronous ProseMirror parser rather than rendering a streaming React component to HTML.

These checks do not establish that arbitrary model reasoning or every application feature is faultless. Historic failed test runs remain in their chats as evidence of the failures corrected during the audit.
