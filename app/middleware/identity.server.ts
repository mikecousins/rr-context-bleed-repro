import { createContext, type MiddlewareFunction } from 'react-router';

// Per-request identity, resolved FROM THE REQUEST and stashed on the RR context.
// This mirrors `clerkMiddleware`, which resolves auth from the request and does
// `context.set(authFnContext, ...)` for loaders to read back via `getAuth`.
export const identityContext = createContext<string | null>(null);

// Read the caller's identity straight off the request. The PoC driver sets a
// distinct value per request via header / cookie / query (all three mirror real
// inputs; the `cookie` path mirrors Clerk's `__session`).
export function identityFromRequest(request: Request): string | null {
  const header = request.headers.get('x-poc-id');
  if (header) return header;

  const cookie = request.headers.get('cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)poc_id=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);

  return new URL(request.url).searchParams.get('u');
}

// Mirrors `clerkMiddleware()`: derive identity from `args.request`, write it to
// the per-request context. If the context were shared across concurrent requests
// (Fork 2), a later request would overwrite an earlier one's value here.
export const identityMiddleware: MiddlewareFunction<Response> = async ({ request, context }) => {
  context.set(identityContext, identityFromRequest(request));
};
