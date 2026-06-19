import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('echo', 'routes/echo.tsx'),
] satisfies RouteConfig;
