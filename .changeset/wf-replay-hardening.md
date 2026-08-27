---
"@circulo-ai/wf": patch
---

Harden durable replay by validating activity inputs against recorded history, preventing duplicate activity side effects after a recorded completion is redelivered, and preserving the original workflow failure when Saga compensations also fail.
