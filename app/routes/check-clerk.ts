import { getAuth } from '@clerk/react-router/server';
import type { Route } from './+types/check-clerk';
import { getInstanceStats } from '../root';

// Decode the `sub` (Clerk user id) straight from this request's __session
// cookie. This is the request's GROUND-TRUTH identity — it can't bleed, because
// it comes off the request object, not the shared context. (Unverified decode is
// fine here: we only compare it; a mismatch is the signal.)
function sessionSub(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  if (!match) return null;
  try {
    const payload = match[1].split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

// `authUserId` is resolved by getAuth() — i.e. read back from the RR context
// that clerkMiddleware populated (the suspect path). `cookieSub` is read
// directly off this request. If they differ, getAuth returned ANOTHER request's
// identity: the cross-user bleed.
//
// Requires CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY (otherwise getAuth throws
// "clerkMiddleware() not detected").
export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  const cookieSub = sessionSub(args.request);
  const { instanceId, maxInFlight } = getInstanceStats();
  const bled = Boolean(userId && cookieSub && userId !== cookieSub);

  return Response.json(
    { authUserId: userId, cookieSub, bled, instanceId, maxInFlight },
    { headers: { 'cache-control': 'no-store' } },
  );
}
