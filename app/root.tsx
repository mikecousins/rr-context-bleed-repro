import { createContext, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';

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
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    const id = new URL(request.url).searchParams.get('id') ?? '<none>';
    context.set(requestIdContext, id);
    await new Promise((resolve) => setTimeout(resolve, 25));
    return next();
  },
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
