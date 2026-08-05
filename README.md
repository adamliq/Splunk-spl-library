# Splunk-spl-library

## Testing

A regression test suite lives in [`tests/`](tests/) — no build step, just
Node.js and `playwright`. See [`tests/README.md`](tests/README.md) for what's
covered and how to run it:

```bash
NODE_PATH="$(npm root -g)" node tests/run-all.js
```
