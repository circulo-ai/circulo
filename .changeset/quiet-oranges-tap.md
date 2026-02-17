---
"@circulo-ai/upload": patch
---

Fix npm publish contents for `@circulo-ai/upload` by explicitly including `dist` files in the package tarball.

This resolves module/type resolution failures caused by missing runtime and declaration files in `1.5.1`.
