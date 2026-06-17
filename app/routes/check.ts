import type { Route } from './+types/check';
import { getInstanceStats, requestIdContext } from '../instrument.server';

// `fromRequest` comes straight off this request's URL — always correct.
// `fromContext` comes from the RR context that the root middleware set for this
// request. If they differ, the context carried ANOTHER concurrent request's
// value: a cross-request bleed.
export async function loader({ request, context }: Route.LoaderArgs) {
  const fromRequest = new URL(request.url).searchParams.get('id') ?? '<none>';
  const fromContext = context.get(requestIdContext);
  const { instanceId, maxInFlight } = getInstanceStats();

  return Response.json(
    { fromRequest, fromContext, bled: fromRequest !== fromContext, instanceId, maxInFlight },
    { headers: { 'cache-control': 'no-store' } },
  );
}
