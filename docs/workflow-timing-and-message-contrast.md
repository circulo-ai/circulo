# Workflow timing and message contrast

## Timing semantics

Workflow messages distinguish three measurements:

- **Active processing:** the union of durable engine-step execution intervals, including failed attempts. Completed steps use their recorded millisecond durations.
- **Waiting / idle:** elapsed time outside those intervals, including approval waits, retry backoff, and downtime between steps.
- **Total elapsed:** wall time from the first start event to the terminal event, or the current sample for an unfinished run.

The header shows active processing. Expanded details show all three. Long durations use minutes, hours, and days. Older traces without enough durable timing data retain an explicitly labeled elapsed-time fallback.

Timing is reconstructed from persisted lifecycle events on chat reads and reconnects. Terminal samples stop at the recorded completion/failure event and stay fixed after reload. Duplicate events and overlapping observations do not double count. Live clocks advance from a local receipt timestamp, avoiding client/server clock subtraction.

These are engine-step timings, not CPU measurements. A process interruption inside an unfinished step cannot be precisely separated from processing using the existing event history. The parent workflow's wall-clock deadline is unchanged; approval waits can still exceed that deadline.

## Reading surfaces

Assistant messages, reasoning, tool results, sources, artifacts, tables, and code blocks use opaque semantic surfaces. The selected wallpaper remains visible around them. Markdown and standalone code blocks share GitHub Light / GitHub Dark Default syntax themes. Tailwind scans Streamdown's shipped classes so its layout and theme utilities work in production. Line numbers use the full muted foreground token rather than a half-opacity color.

## Verification

- Server: 46 test files / 194 tests passed. Web: 12 test files / 78 tests passed. Both TypeScript checks passed.
- Server production bundling, the Next production build, runtime preparation, and Windows desktop directory packaging passed. The packaged server's SHA-256 matches the built server bundle.
- Timing regression cases cover overnight approval waits, terminal/replay stability, multiple resumptions, overlapping intervals, missing/invalid durations, retries/backoff, clock skew, and duration formatting.
- Syntax contrast regression checks cover comments, strings, keywords, identifiers, numbers, and punctuation in both configured themes, requiring at least 4.5:1 against the default reading surfaces.
- The reported overnight workflow was opened through the packaged desktop service: **14.1 s active**, **18h 57m waiting/idle**, **18h 57m total elapsed**.
- The affected code response was checked in both light and dark themes. The narrow viewport pass identified and corrected a truncated workflow heading and faint line numbers.
- Final confirmation: code block backgrounds are opaque in both themes; dark comments use `#8B949E`; line numbers use the full foreground token. At 390px, the workflow header wraps to two rows and the document has no horizontal overflow. Long code lines scroll inside their code block. The original System appearance preference was restored.
- The final packaged desktop app was relaunched; its API health and web root both returned HTTP 200.

This verification concerns workflow timing and message readability. It does not certify unrelated features or native OS interactions.
