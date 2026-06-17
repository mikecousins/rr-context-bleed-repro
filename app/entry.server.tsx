import type { AppLoadContext, EntryContext } from 'react-router';
import { handleRequest } from '@vercel/react-router/entry.server';

// Mirrors the production app's entry: delegate document rendering to the Vercel
// adapter's handler. (Nothing custom here — included only to match prod.)
export default function handleDocumentRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) {
  return handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext);
}
