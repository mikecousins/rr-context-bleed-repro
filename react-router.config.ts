import type { Config } from '@react-router/dev/config';
import { vercelPreset } from '@vercel/react-router/vite';

// The exact combination used in production: SSR + RR middleware (v8_middleware)
// + the Vercel adapter preset. Remove `vercelPreset()` and deploy elsewhere (or
// run `npm start` locally) and the bleed disappears — which is the whole point.
export default {
  ssr: true,
  future: {
    v8_middleware: true,
  },
  presets: [vercelPreset()],
} satisfies Config;
