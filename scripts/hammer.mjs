// Drives concurrent traffic at the /check endpoint and reports cross-request
// context bleeds.
//
// Each request carries a unique `id`. The server echoes both the id from the
// request URL (`fromRequest`, always correct) and the id it read back from the
// React Router context that middleware set for that request (`fromContext`). If
// they ever differ, one request observed another request's context value.
//
// Usage:
//   node scripts/hammer.mjs <base-url> [total=1000] [concurrency=50]
//
// Expectation:
//   - Locally (`npm start`, react-router-serve): 0 bleeds — RR builds a fresh
//     context per request.
//   - On Vercel serverless under concurrency: bleeds > 0 (the bug).

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const total = Number(process.argv[3] || 1000);
const concurrency = Number(process.argv[4] || 50);

let sent = 0;
let bled = 0;
let errors = 0;
let maxConcurrentOnOneInstance = 0;
const samples = [];
const instances = new Set();

async function one(i) {
  const id = `req-${i}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const res = await fetch(`${base}/check?id=${encodeURIComponent(id)}`, {
      headers: { accept: 'application/json' },
    });
    const data = await res.json();
    if (data.instanceId) instances.add(data.instanceId);
    if (typeof data.maxInFlight === 'number' && data.maxInFlight > maxConcurrentOnOneInstance) {
      maxConcurrentOnOneInstance = data.maxInFlight;
    }
    if (data.bled) {
      bled++;
      if (samples.length < 10) {
        samples.push({ expected: data.fromRequest, gotFromContext: data.fromContext });
      }
    }
  } catch {
    errors++;
  }
}

async function run() {
  const queue = Array.from({ length: total }, (_, i) => i);
  const workers = Array.from({ length: concurrency }, async () => {
    let i;
    while ((i = queue.pop()) !== undefined) {
      sent++;
      await one(i);
    }
  });
  await Promise.all(workers);

  console.log(`\nBase URL:    ${base}`);
  console.log(`Requests:    ${sent} (concurrency ${concurrency})`);
  console.log(`Errors:      ${errors}`);
  console.log(`Instances:   ${instances.size} distinct warm instance(s) served the load`);
  console.log(`Max concurrency on one instance: ${maxConcurrentOnOneInstance}` +
    (maxConcurrentOnOneInstance < 2
      ? '  ⚠️  never >1 — no in-instance concurrency, so a clean result is INCONCLUSIVE'
      : '  (real in-instance concurrency was exercised)'));
  console.log(`Bled:        ${bled}  (${sent ? ((bled / sent) * 100).toFixed(2) : '0'}%)`);

  if (samples.length) {
    console.log(`\nSample bleeds (a request saw ANOTHER request's context value):`);
    for (const s of samples) {
      console.log(`  expected id=${s.expected}  but context held=${s.gotFromContext}`);
    }
    console.log(`\n❌ Context bled across requests — the RouterContextProvider was shared.`);
    process.exit(1);
  }
  console.log(`\n✅ No bleed observed — every request saw its own context value.`);
}

run();
