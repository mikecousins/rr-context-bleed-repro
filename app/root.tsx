import { randomUUID } from 'node:crypto';
import { createContext, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { clerkMiddleware } from '@clerk/react-router/server';
import type { Route } from './+types/root';

// Clerk's middleware activates only when keys are present, so the plain `/check`
// harness still runs without any Clerk setup. With keys, the app mirrors
// production: clerkMiddleware resolves the session and stores it in the RR
// context, and `/check-clerk` reads it back via getAuth.
const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

// Module-level (per warm instance) instrumentation, so the load test can PROVE
// it actually exercised in-instance concurrency — otherwise a clean result is
// meaningless. INSTANCE_ID is stable for the life of a warm instance; inFlight
// counts requests executing concurrently on this instance right now.
const INSTANCE_ID = randomUUID();
let inFlight = 0;
let maxInFlight = 0;
export const getInstanceStats = () => ({ instanceId: INSTANCE_ID, maxInFlight });

// A per-request value, written into the React Router context by middleware and
// read back from a loader. This is exactly the pattern @clerk/react-router uses
// for the authenticated user:
//
//   clerkMiddleware:  args.context.set(authFnContext, () => requestState.toAuth())
//   getAuth(args):    args.context.get(authFnContext)
//
// The request object is per-request and never wrong. The hazard is the context
// round-trip: if the RouterContextProvider is shared across concurrent requests,
// one request's loader reads another request's value.
export const requestIdContext = createContext<string>('<none>');

// Stand-in for clerkMiddleware. Resolves an identity from THIS request, stores
// it in the RR context, then yields. The small await models the network call a
// real auth middleware makes (e.g. Clerk's authenticateRequest), which widens
// the window in which a concurrent request sharing the same context can
// overwrite the value before this request's loader reads it back.
const probeMiddleware: Route.MiddlewareFunction = async ({ request, context }, next) => {
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

export const middleware: Route.MiddlewareFunction[] = [
  probeMiddleware,
  // Same position as production: Clerk resolves the session per request and
  // stores it in the RR context for getAuth() to read back.
  ...(clerkEnabled ? [clerkMiddleware()] : []),
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
