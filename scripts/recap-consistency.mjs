const base = (process.env.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

const payload = (run) => ({
  student_name: `Persistence check ${run}`,
  session_title: 'Shared recap consistency',
  session_date: '2026-08-27',
  summary: 'A harmless lifecycle check.',
  moments: [{
    id: `moment-${run}`,
    at: '2026-08-27T10:02:00Z',
    kind: 'attempt',
    outcome: 'progressing',
    note: 'Checked the base case.',
    attachment: null
  }],
  next_tasks: [{ id: `task-${run}`, text: 'Trace one more call.', done: false }],
  consent: true,
  expires_days: 7
});

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* status is enough for delete */ }
  return { response, body };
}

for (let run = 1; run <= 8; run += 1) {
  // A lifecycle deliberately fans out reads. Keep consecutive lifecycles in
  // separate one-second allowance windows so this consistency check tests
  // persistence without defeating the response-policy gate it also relies on.
  if (run > 1) await new Promise(resolve => setTimeout(resolve, 1_050));

  const created = await request('/api/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload(run))
  });
  if (created.response.status !== 201 || !created.body?.id || !created.body?.delete_key) {
    throw new Error(`create ${run} failed: ${created.response.status} ${JSON.stringify(created.body)}`);
  }

  const { id, delete_key: key } = created.body;
  const reads = await Promise.all(Array.from({ length: 12 }, () => request(`/api/shares/${id}`)));
  if (reads.some(({ response }) => response.status !== 200)) {
    throw new Error(`read ${run} was inconsistent: ${reads.map(({ response }) => response.status).join(', ')}`);
  }
  const status = await request(`/api/shares/${id}/status?key=${encodeURIComponent(key)}`);
  if (status.response.status !== 200 || status.body?.opens !== 12) {
    throw new Error(`status ${run} failed: ${status.response.status} ${JSON.stringify(status.body)}`);
  }

  const deleted = await request(`/api/shares/${id}?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  if (deleted.response.status !== 204) throw new Error(`delete ${run} failed: ${deleted.response.status}`);
  const absent = await Promise.all(Array.from({ length: 6 }, () => request(`/api/shares/${id}`)));
  if (absent.some(({ response }) => response.status !== 404)) {
    throw new Error(`delete ${run} was inconsistent: ${absent.map(({ response }) => response.status).join(', ')}`);
  }
}

console.log(JSON.stringify({ base, lifecycles: 8, concurrentReadsPerLifecycle: 12, postDeleteReads: 6, result: 'passed' }));
