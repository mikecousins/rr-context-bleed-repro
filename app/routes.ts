import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('./routes/_index.tsx'),
  // Resource route returning JSON — what the load-test script hits.
  route('check', './routes/check.ts'),
] satisfies RouteConfig;
