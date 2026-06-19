import type { Route } from './+types/echo';
import { identityContext, identityFromRequest, identityMiddleware } from '../middleware/identity.server';
import { enter, leave, stats } from '../instrument.server';

// Route-level middleware guarantees the identity middleware runs for this
// resource route (mirrors clerkMiddleware on the root route in production).
export const middleware = [identityMiddleware];

// Artificial delay to widen the interleave window so two concurrent invocations
// on one warm instance reliably overlap across this `await`. Low concurrency +
// this delay = deterministic overlap WITHOUT high-rate hammering (so Vercel's
// edge abuse-protection is never tripped). Tune via POC_DELAY_MS.
const DELAY_MS = Number(process.env.POC_DELAY_MS ?? '150');

// Resource route (no default export): a GET returns this JSON directly.
export async function loader({ request, context }: Route.LoaderArgs) {
  const inFlightAtEntry = enter();
  try {
    // (A) identity read straight off THIS loader's `args.request` — the Fork-3 probe.
    //     If the adapter handed us another concurrent invocation's Request, this
    //     is the *other* user's id.
    const servedFromArgsRequest = identityFromRequest(request);

    // (B) identity the middleware wrote into the per-request RR context — the
    //     Fork-2 probe. Differs from (A) only if the context is shared/raced.
    const servedFromContext = context.get(identityContext);

    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

    const s = stats();
    return Response.json({
      servedFromArgsRequest,
      servedFromContext,
      instanceId: s.instanceId,
      inFlightAtEntry,
      maxConcurrent: s.maxConcurrent,
      url: request.url,
    });
  } finally {
    leave();
  }
}
