const base = (process.env.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

const payload = run => ({
  student_name: `Rate policy ${run}`,
  session_title: 'Response policy check',
  session_date: '2026-08-30',
  summary: 'A temporary response-policy fixture.',
  moments: [],
  next_tasks: [],
  consent: true,
  expires_days: 1,
});

const createdShares = [];
for (let run = 1; run <= 20; run += 1) {
  const response = await fetch(`${base}/api/shares`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload(run)),
  });
  if (response.status !== 201) throw new Error(`Create allowance ended at ${run}: ${response.status}`);
  createdShares.push(await response.json());
}

const blockedCreate = await fetch(`${base}/api/shares`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload(21)),
});
if (blockedCreate.status !== 429 || blockedCreate.headers.get('retry-after') !== '60') {
  throw new Error(`Create limit response differed: ${blockedCreate.status} Retry-After=${blockedCreate.headers.get('retry-after')}`);
}

for (const share of createdShares) {
  const response = await fetch(`${base}/api/shares/${share.id}?key=${encodeURIComponent(share.delete_key)}`, { method: 'DELETE' });
  if (response.status !== 204) throw new Error(`Could not remove response-policy fixture: ${response.status}`);
}

await new Promise(resolve => setTimeout(resolve, 1_050));
const reads = await Promise.all(Array.from({ length: 130 }, () => fetch(`${base}/api/shares/not-a-valid-id`)));
const missing = reads.filter(response => response.status === 404);
const limited = reads.filter(response => response.status === 429);
if (missing.length !== 100 || limited.length !== 30) {
  throw new Error(`Read allowance differed: 404=${missing.length}, 429=${limited.length}`);
}
if (limited.some(response => response.headers.get('retry-after') !== '1')) {
  throw new Error('A limited read omitted Retry-After: 1.');
}

console.log(JSON.stringify({
  base,
  create: { allowed: 20, limited: 1, retryAfter: 60 },
  read: { allowed: 100, limited: 30, retryAfter: 1 },
  result: 'passed',
}));
