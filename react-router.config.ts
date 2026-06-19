import type { Config } from '@react-router/dev/config';
import { vercelPreset } from '@vercel/react-router/vite';

// Mirrors the production stack that exhibits the bleed:
// SSR + framework middleware (v8_middleware) + the Vercel preset (Node serverless).
//
// The Vercel preset emits per-route server bundles consumed by Vercel's builder,
// which `react-router-serve` can't run directly. Apply it only on Vercel
// (`VERCEL=1` is set automatically there) so local `react-router build` +
// `react-router-serve` still produce a single runnable bundle for validation.
export default {
  ssr: true,
  future: {
    v8_middleware: true,
  },
  presets: process.env.VERCEL ? [vercelPreset()] : [],
} satisfies Config;
