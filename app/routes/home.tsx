export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '3rem auto', lineHeight: 1.5 }}>
      <h1>rr-context-bleed PoC</h1>
      <p>
        This app reproduces cross-invocation <code>Request</code> aliasing in React Router v7 on
        Vercel serverless under Fluid Compute (the &ldquo;Fork 3&rdquo; boundary).
      </p>
      <p>
        The detector lives at <code>/echo?u=&lt;id&gt;</code> (a JSON resource route). Drive it with{' '}
        <code>scripts/drive.mjs</code> and read the report. See <code>README.md</code> for exact steps.
      </p>
      <p>
        Try one request:{' '}
        <a href="/echo?u=demo">
          <code>/echo?u=demo</code>
        </a>
      </p>
    </main>
  );
}
