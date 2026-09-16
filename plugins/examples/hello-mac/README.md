# Hello Mac (example plugin)

Official catalog example for M23.

- `hub.notify` — safe; works once **active** (no grant needed)
- `thread.post_message` — **sensitive**; requires operator grant

Host never allows `config.write` / `store.flush` (Iron Laws).
