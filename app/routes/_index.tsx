import type { Route } from './+types/_index';
import { requestIdContext } from '../instrument.server';

export async function loader({ request, context }: Route.LoaderArgs) {
  const fromRequest = new URL(request.url).searchParams.get('id') ?? '<none>';
  const fromContext = context.get(requestIdContext);
  return { fromRequest, fromContext, bled: fromRequest !== fromContext };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, lineHeight: 1.5 }}>
      <h1>React Router + Vercel context-bleed repro</h1>
      <p>
        fromRequest: <code>{loaderData.fromRequest}</code>
      </p>
      <p>
        fromContext: <code>{loaderData.fromContext}</code>
      </p>
      <p>
        bled: <strong>{String(loaderData.bled)}</strong>
      </p>
      <p>
        Hit <code>/check?id=SOMETHING</code> for JSON, or run{' '}
        <code>node scripts/hammer.mjs &lt;url&gt;</code> to drive concurrent traffic.
      </p>
    </main>
  );
}
