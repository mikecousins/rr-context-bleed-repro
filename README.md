# rr-context-bleed PoC — cross-invocation `Request` aliasing on Vercel Fluid Compute

A minimal, deterministic proof-of-concept for a **cross-user request bleed**: under
Vercel **Fluid Compute** (in-instance request concurrency), a React Router v7 loader can
be handed **another concurrent invocation's `Request`**, so one caller is served data
derived from a different caller's request. This is the **"Fork 3"** boundary — the
adapter/runtime hands the loader the wrong `Request`; it is *not* an auth bug and *not* a
shared React Router context (those are Forks 1 and 2, also probed here so they can be
ruled out).

No auth / Clerk / database. Each request carries a unique id; the detector flags any
response whose id doesn't match the one the caller sent.

## Stack (mirrors the affected production app)

- React Router v7, framework mode, **SSR**, `future.v8_middleware: true`
- `@vercel/react-router` **1.3.1** preset, Node serverless runtime
- `react-router` **7.17.0**
- No `vercel.json`; runtime/concurrency are Vercel **project settings**

## How the detector works

- `/echo?u=<id>` is a JSON resource route. Its loader records three things:
  - **`servedFromArgsRequest`** — the id read straight off **`args.request`** (header /
    cookie / query). *This is the Fork-3 probe.* If the adapter handed this loader a
    different invocation's `Request`, this is the **other** caller's id.
  - **`servedFromContext`** — the id a route middleware wrote into the per-request RR
    context (mirrors `clerkMiddleware` → `getAuth`). *Fork-2 probe.*
  - **`instanceId` / `inFlightAtEntry` / `maxConcurrent`** — module-scoped counters that
    prove whether two requests were actually in flight **on the same warm instance**.
- The loader `await`s `POC_DELAY_MS` (default 150 ms) to **widen the interleave window**,
  so overlap is reliable at *low* concurrency — no high-rate hammering, so Vercel's edge
  abuse-protection is never tripped (that 403 wall is what blocked earlier attempts).
- `scripts/drive.mjs` fires small batches (default **2**) of concurrent requests, each
  with a **globally unique id**, and flags any mismatch.

## Quick start (local — validates the harness)

```bash
npm install
npm run build
npm start            # react-router-serve on http://localhost:3000  (leave running)

# ...then in another shell:
npm run drive        # or: node scripts/drive.mjs 300 2
```

**Expected locally:** `maxConcurrentObservedOnAnyInstance >= 2` (the driver really does
overlap requests) and `FORK3_request_aliasing: 0` / `FORK2_context_bleed: 0`. A single
local Node server builds a fresh `Request` per request, so it does **not** bleed — this
confirms the harness reports *clean* correctly and that React Router itself is sound.

## Reproduce on Vercel (the actual test)

1. Deploy this directory to a Vercel project (framework auto-detects as React Router):
   ```bash
   npx vercel deploy            # or: git push to a Vercel-connected repo
   ```
2. **Enable Fluid Compute:** Project → **Settings → Functions → Fluid Compute → On**, then
   **redeploy** (the toggle only applies to new deployments). This is the precondition —
   the bleed requires two requests sharing one warm instance.
3. Drive it against the deployment (low concurrency by design):
   ```bash
   BASE=https://<your-deployment-url> node scripts/drive.mjs 300 2
   ```
   If you want a wider window: `POC_DELAY_MS` is baked at build time per deploy; redeploy
   with e.g. `POC_DELAY_MS=300` set as an env var, or raise concurrency: `... 300 3`.

### What confirms the bug

```
"maxConcurrentObservedOnAnyInstance": >= 2,   // two requests overlapped on ONE instance
"distinctInstances": [ "<few>" ],             // and reused a warm instance
"FORK3_request_aliasing": > 0                 // a loader read another invocation's Request
```

with `sampleBleeds` entries like:

```json
{ "kind": "FORK3_request_aliasing", "asked": "u_42_0", "gotFromArgsRequest": "u_42_1",
  "instanceId": "ab12cd34", "inFlightAtEntry": 2, "url": ".../echo?u=u_42_1" }
```

`asked` is the id the caller sent; `gotFromArgsRequest` is the id the loader read off
`args.request`. They differ → the loader was handed a different concurrent invocation's
`Request` on the same warm instance. Note even `url` is the other request's URL, i.e. the
entire `Request` object is the wrong one (not a mis-parse).

## Interpreting results

| Result | Meaning |
| --- | --- |
| `maxConcurrent < 2` | No overlap happened — inconclusive. Enable Fluid Compute; raise concurrency / `POC_DELAY_MS`. |
| `FORK3 > 0` | **Request aliasing across concurrent invocations** (the platform layer). |
| `FORK2 > 0`, `FORK3 = 0` | Shared/raced RR context only (app-level `getLoadContext` pattern). |
| all `0`, `maxConcurrent >= 2` | No bleed under the exercised concurrency. |

## Knobs

- `POC_DELAY_MS` (build-time env, default `150`) — interleave window width.
- arg 1 `rounds` (default `300`), arg 2 `concurrency` (default `2`), `BATCH_PAUSE_MS`
  (default `25`).

## Why this layer

The `@vercel/react-router` **npm** package ships no code that holds a `Request` across
invocations: `entry.server.js`'s `handleRequest` takes `request`/`routerContext` as
parameters, and `vite.js` (`vercelPreset()`) is a build-time plugin only. React Router
core + `@react-router/node` are per-request safe (this harness is **clean** on local
`react-router-serve`). The only remaining component is the **serverless function
entrypoint generated by Vercel's builder** under `.vercel/output/functions/**` plus the
**Fluid Compute runtime** that multiplexes concurrent invocations into one warm instance —
which is what this PoC exercises.
