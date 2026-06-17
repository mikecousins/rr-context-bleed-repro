# React Router middleware context bleeds across requests on Vercel

Minimal reproduction of a **cross-request state bleed**: with React Router v7
framework mode + `future.v8_middleware` + the `@vercel/react-router` adapter, a
value written into the per-request `RouterContextProvider` by middleware can be
read back by a **different** concurrent request's loader.

In a real app this is a security issue: it's how one signed-in user can be served
another user's authenticated page.

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

## Run it on Vercel — bleeds (the bug)

```bash
npm i -g vercel
vercel deploy --prod      # or push to a Vercel-connected git repo
node scripts/hammer.mjs https://<your-deployment>.vercel.app 2000 100
```

Expected: `❌ Context bled across requests` with `Bled: N (>0%)` and sample lines
like:

```
expected id=req-417-ab12cd34  but context held=req-significant-other-id
```

Same code, same versions — the only change from the clean run is that requests
are served by the Vercel serverless adapter instead of `react-router-serve`.
Bleeds appear once concurrent requests land on the same warm instance, so drive
enough traffic (a few thousand requests) and re-run if the first burst hits cold
instances.

## What a fix looks like

Each request must get its own `RouterContextProvider`. Application code can
mitigate by re-deriving identity from the request rather than trusting the
context round-trip, but the correct fix is for every request to receive an
isolated context.
