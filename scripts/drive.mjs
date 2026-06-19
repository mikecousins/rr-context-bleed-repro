// Deterministic, LOW-RATE concurrency driver + detector.
//
// It fires small batches of concurrent requests, each for a DISTINCT user id,
// and flags any response whose echoed identity != the id we asked for:
//
//   FORK3_request_aliasing  response read a different invocation's args.request
//                           (the id off args.request != the id we sent)
//   FORK2_context_bleed     args.request was right, but the RR context value was
//                           another request's (shared/raced context)
//
// Each request uses a globally-unique id, so any mismatch is unambiguous
// cross-request contamination, not a collision.
//
// Designed to AVOID edge abuse-protection: concurrency is tiny (default 2) and
// there is a pause between batches. We rely on POC_DELAY_MS in the loader (not
// request volume) to force overlap.
//
// Usage:
//   BASE=https://<deployment>  node scripts/drive.mjs [rounds] [concurrency]
//   (defaults: BASE=http://localhost:3000, rounds=300, concurrency=2)

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const ROUNDS = Number(process.argv[2] || 300);
const CONCURRENCY = Number(process.argv[3] || 2);
const BATCH_PAUSE_MS = Number(process.env.BATCH_PAUSE_MS || 25);

let ok = 0;
let errors = 0;
let maxConcurrentSeen = 0;
const instances = new Set();
const bleeds = [];

async function hit(id) {
  let res;
  try {
    res = await fetch(`${BASE}/echo?u=${encodeURIComponent(id)}`, {
      headers: {
        'x-poc-id': id,
        cookie: `poc_id=${id}`,
        accept: 'application/json',
      },
    });
  } catch {
    errors += 1;
    return;
  }
  if (!res.ok) {
    errors += 1;
    return;
  }
  let body;
  try {
    body = await res.json();
  } catch {
    errors += 1;
    return;
  }
  ok += 1;
  instances.add(body.instanceId);
  if (typeof body.maxConcurrent === 'number' && body.maxConcurrent > maxConcurrentSeen) {
    maxConcurrentSeen = body.maxConcurrent;
  }

  // Fork 3: the loader read a different invocation's Request.
  if (body.servedFromArgsRequest !== id) {
    bleeds.push({
      kind: 'FORK3_request_aliasing',
      asked: id,
      gotFromArgsRequest: body.servedFromArgsRequest,
      instanceId: body.instanceId,
      inFlightAtEntry: body.inFlightAtEntry,
      url: body.url,
    });
  }

  // Fork 2: Request was correct, but the shared context held another request's
  // value. (Skipped when context is null, e.g. middleware didn't populate it.)
  if (
    body.servedFromContext != null &&
    body.servedFromContext !== body.servedFromArgsRequest
  ) {
    bleeds.push({
      kind: 'FORK2_context_bleed',
      requestId: body.servedFromArgsRequest,
      contextId: body.servedFromContext,
      instanceId: body.instanceId,
    });
  }
}

// Warm an instance first so the concurrent batches reuse it (the race needs a
// warm, shared instance — not cold starts that each get their own).
for (let i = 0; i < 5; i++) await hit(`warmup_${i}`);

for (let r = 0; r < ROUNDS; r++) {
  const batch = [];
  for (let lane = 0; lane < CONCURRENCY; lane++) {
    // Globally unique id per request.
    batch.push(hit(`u_${r}_${lane}`));
  }
  await Promise.all(batch);
  if (BATCH_PAUSE_MS) await new Promise((res) => setTimeout(res, BATCH_PAUSE_MS));
}

const fork3 = bleeds.filter((b) => b.kind === 'FORK3_request_aliasing').length;
const fork2 = bleeds.filter((b) => b.kind === 'FORK2_context_bleed').length;

console.log(
  JSON.stringify(
    {
      base: BASE,
      requestsOk: ok,
      errors,
      distinctInstances: [...instances],
      maxConcurrentObservedOnAnyInstance: maxConcurrentSeen,
      FORK3_request_aliasing: fork3,
      FORK2_context_bleed: fork2,
      sampleBleeds: bleeds.slice(0, 20),
    },
    null,
    2,
  ),
);

if (maxConcurrentSeen < 2) {
  console.log(
    '\n[!] maxConcurrent < 2 — no two requests ever overlapped on one instance.\n' +
      '    Nothing can be concluded. On Vercel: ensure Fluid Compute is ENABLED, then\n' +
      '    raise concurrency (arg 2) and/or POC_DELAY_MS so requests reliably overlap.',
  );
} else if (fork3 > 0) {
  console.log(
    `\n[FORK 3 CONFIRMED] ${fork3} response(s) read a DIFFERENT concurrent invocation's\n` +
      `    args.request (maxConcurrent=${maxConcurrentSeen}, instances=${instances.size}).\n` +
      '    The adapter/runtime aliased the Request across concurrent invocations on a warm instance.',
  );
} else if (fork2 > 0) {
  console.log(`\n[FORK 2] ${fork2} context bleed(s): shared RR context across requests.`);
} else {
  console.log(
    '\n[clean] Concurrency was exercised (maxConcurrent >= 2) with 0 aliasing.\n' +
      '    Expected on local react-router-serve. Re-run against a Vercel deployment with\n' +
      '    Fluid Compute enabled to test the platform request-dispatch path.',
  );
}
