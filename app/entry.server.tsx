import type { AppLoadContext, EntryContext } from 'react-router';
import { handleRequest } from '@vercel/react-router/entry.server';

// Mirrors the production app: delegate document rendering to the
// `@vercel/react-router` entry server (per-request `request` + `routerContext`).
export const streamTimeout = 5_000;

export default function handleDocumentRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) {
  return handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext);
}
