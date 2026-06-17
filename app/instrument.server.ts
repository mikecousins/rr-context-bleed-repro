import { randomUUID } from 'node:crypto';
import { createContext, type MiddlewareFunction } from 'react-router';

// Server-only instrumentation for the harness. It lives in a `.server.ts` module
// so its Node-only `node:crypto` import never reaches the client bundle —
// importing a node built-in from a client-shared module (like root.tsx) breaks
// the build with `MISSING_EXPORT: 'randomUUID' (… __vite-browser-external)`.

// A per-request value written into the RR context by middleware and read back
// from a loader — the same pattern @clerk/react-router uses for the auth user
// (clerkMiddleware: context.set(authFnContext, …); getAuth: context.get(authFnContext)).
export const requestIdContext = createContext<string>('<none>');

// Module-level (per warm instance) counters so the load test can PROVE it
// exercised in-instance concurrency — otherwise a clean result is meaningless.
const INSTANCE_ID = randomUUID();
let inFlight = 0;
let maxInFlight = 0;
export const getInstanceStats = () => ({ instanceId: INSTANCE_ID, maxInFlight });

// Stand-in for clerkMiddleware: resolve an identity from THIS request, store it
// in the RR context, then yield. The await models the network round-trip a real
// auth middleware makes, widening the window in which a concurrent request
// sharing the same context could overwrite the value before the loader reads it.
export const probeMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const id = new URL(request.url).searchParams.get('id') ?? '<none>';
  context.set(requestIdContext, id);
  inFlight += 1;
  if (inFlight > maxInFlight) maxInFlight = inFlight;
  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return await next();
  } finally {
    inFlight -= 1;
  }
};
