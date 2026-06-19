// Module-scoped state. Under Vercel Fluid Compute, ONE warm instance serves
// multiple concurrent invocations, so these are shared across overlapping
// requests — which is exactly how we prove that two requests were in flight on
// the same instance at the same time (the precondition for the race).

export const INSTANCE_ID = Math.random().toString(36).slice(2, 10);

let inFlight = 0;
let maxConcurrent = 0;
const bootAt = Date.now();

/** Call at loader entry. Returns the in-flight count *including* this request. */
export function enter(): number {
  inFlight += 1;
  if (inFlight > maxConcurrent) maxConcurrent = inFlight;
  return inFlight;
}

/** Call at loader exit (in a `finally`). */
export function leave(): void {
  inFlight -= 1;
}

export function stats() {
  return {
    instanceId: INSTANCE_ID,
    inFlight,
    maxConcurrent,
    uptimeMs: Date.now() - bootAt,
  };
}
