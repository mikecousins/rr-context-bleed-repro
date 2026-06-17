import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { clerkMiddleware } from '@clerk/react-router/server';
import type { Route } from './+types/root';
import { probeMiddleware } from './instrument.server';

// Clerk's middleware activates only when keys are present, so the plain `/check`
// harness still runs without any Clerk setup. With keys, the app mirrors
// production: clerkMiddleware resolves the session and stores it in the RR
// context, and `/check-clerk` reads it back via getAuth.
const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

export const middleware: Route.MiddlewareFunction[] = [
  // Stand-in for clerkMiddleware (server-only — defined in instrument.server.ts).
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
