---
"@circulo-ai/upload": patch
---

Added lazy initialization support for upload storage so provider creation is deferred until the first request, which should avoid next build failures from missing env values or eager connections.
