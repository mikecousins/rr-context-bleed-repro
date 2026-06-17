import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('./routes/_index.tsx'),
  // Resource route returning JSON — what the load-test script hits.
  route('check', './routes/check.ts'),
  // Clerk-backed variant (needs CLERK_* env keys). Mirrors the production path:
  // getAuth() reads the session from the RR context that clerkMiddleware set.
  route('check-clerk', './routes/check-clerk.ts'),
] satisfies RouteConfig;
