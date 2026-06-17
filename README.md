# React Router middleware context — cross-request bleed harness (Vercel)

Minimal harness investigating a suspected **cross-request state bleed**: with
React Router v7 framework mode + `future.v8_middleware` + the
`@vercel/react-router` adapter, the hypothesis is that a value written into the
per-request `RouterContextProvider` by middleware could be read back by a
**different** concurrent request's loader. In a real app that's a security issue —
one signed-in user served another user's authenticated page.

> **Status:** in our own testing this harness has **not** reproduced the bleed
> yet (see [What we observed](#what-we-observed)). It's published so the React
> Router / Vercel / Clerk teams can test the hypothesis under controlled load
> (Fluid Compute concurrency, real load tooling). Reproduction may require
> conditions a minimal harness doesn't hit — see the notes below.

## Why this matters for `@clerk/react-router`

`@clerk/react-router` resolves the session **from the request** (correct) but
then stores it in the React Router context, and `getAuth()` reads it back from
there:

```js
// @clerk/react-router/dist/server/clerkMiddleware.js
const requestState = await clerkClient(args, options).authenticateRequest(clerkRequest, { ... });
args.context.set(authFnContext, (opts) => requestState.toAuth(opts));

// @clerk/react-router/dist/server/getAuth.js
const authObjectFn = args.context.get(authFnContext);
return getAuthObjectForAcceptedToken({ authObject: authObjectFn(...), ... });
```

So if the `RouterContextProvider` is shared across concurrent requests, one
request's `getAuth()` returns the auth that another request's `clerkMiddleware`
wrote. This repro removes Clerk entirely and reproduces the same mechanism with a
plain string, to isolate the framework/adapter layer.

## The mechanism

- `app/root.tsx` exports a middleware that, per request, reads `?id=` off the
  request and does `context.set(requestIdContext, id)` (a stand-in for
  `clerkMiddleware`). A 25ms `await` models the network round-trip a real auth
  middleware makes, widening the concurrency window.
- `app/routes/check.ts` is a loader that returns both `fromRequest` (the id off
  this request's URL — always correct) and `fromContext` (`context.get(...)`).
- `bled = fromRequest !== fromContext`. Any `true` means the context was shared.

## Stack (matches the affected production app)

- `react-router` `7.17.0`, `@react-router/node|serve|dev` `7.17.0`
- `@vercel/react-router` `1.3.1`
- `future: { v8_middleware: true }`, `presets: [vercelPreset()]`, `ssr: true`
- Node serverless runtime

## Run it locally — clean (control)

```bash
npm install
npm run build
npm start                 # react-router-serve on http://localhost:3000
# in another terminal:
npm run hammer            # node scripts/hammer.mjs http://localhost:3000 1000 50
```

Expected: `✅ No bleed observed`. React Router's own server builds a fresh
`RouterContextProvider` for every request, so the context never leaks.

> Note: `vercelPreset()` nests the server build under
> `build/server/nodejs_.../index.js` (reflected in the `start` script). Serving
> that **same build** with plain `react-router-serve` stays clean even under
> heavy concurrency — verified here at 2000 requests / concurrency 100, 0 bleeds.
> That's what pins the bug to the Vercel serverless runtime rather than the build
> or the app code.

## Run it on Vercel

```bash
npm i -g vercel
vercel deploy --prod      # or import the repo in the Vercel dashboard
node scripts/hammer.mjs https://<your-deployment>.vercel.app 5000 100
```

Hypothesis: if the serverless adapter reuses one `RouterContextProvider` across
concurrent requests on a warm instance, a loader reads another request's value
and you'll see `Bled: N (>0%)` with lines like:

```
expected id=req-417-ab12cd34  but context held=req-different-request
```

**Confirm concurrency first.** The harness reports `Max concurrency on one
instance` (from a module-level in-flight counter exposed via `/check`). A clean
result is only meaningful if that number is **≥ 2** — otherwise no two requests
ever overlapped on a shared instance and the test proved nothing. In-instance
concurrency on Vercel requires **Fluid Compute** (concurrent invocations per
instance); make sure it's enabled. Also note that aggressive load can trip
Vercel's edge abuse-protection (HTTP 403), so prefer your own internal load
tooling over an external hammer.

## What we observed

This harness did **not** reproduce a bleed in ~21,000 requests (concurrency up to
250) before Vercel's edge abuse-protection rate-limited the external load
generator, and we could not confirm in-instance concurrency was exercised. That
is consistent with the code: React Router's own server (`react-router-serve`)
builds a fresh context per request (verified clean at 2,000 req / concurrency
100), and `@clerk/react-router`'s `clerkMiddleware` / `getAuth` / `clerkClient`
are all request-scoped. So a minimal harness may be insufficient — reproducing
the production bleed likely requires Fluid Compute in-instance concurrency and/or
the real Clerk request path. This repo is a **starting harness** for testing the
hypothesis under controlled conditions, not a confirmed reproduction.

## What a fix looks like

Each request must get its own `RouterContextProvider`. Application code can
mitigate by re-deriving identity from the request rather than trusting the
context round-trip, but the correct fix is for every request to receive an
isolated context.
