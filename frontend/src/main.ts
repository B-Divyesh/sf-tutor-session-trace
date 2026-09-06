import './style.css';
import { emptyStore, formatTime, label, newId, sessionMarkdown, studentRecap, type TraceSession, type TraceStore } from './model';

const app = document.querySelector<HTMLDivElement>('#app')!;
const STORE_KEY = 'tutor-session-trace:v1';
const DEMO_STORE_KEY = 'demo:tutor-session-trace:v1';
const LICENSE_KEY = 'sb_license:tutor-session-trace';
const VERDICT_KEY = `${LICENSE_KEY}:verdict`;
const BILLING = 'https://api.sociobot.in/api/v1/products/tutor-session-trace';
let storageError = '';
let demoMode = location.pathname === '/demo' || new URLSearchParams(location.search).get('demo') === '1';
let store = loadStore();
let paid = cachedPaid();
let toast = '';
const routeStatus = document.querySelector<HTMLElement>('#route-status');

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function loadStore(): TraceStore {
  try {
    const stored = localStorage.getItem(demoMode ? DEMO_STORE_KEY : STORE_KEY);
    if (demoMode && stored === null) return sampleStore();
    const parsed = JSON.parse(stored || 'null');
    return parsed?.sessions && Array.isArray(parsed.sessions) ? parsed : emptyStore();
  } catch {
    storageError = 'Saved notes could not be read. New notes will still work, but export them before leaving.';
    return emptyStore();
  }
}

function save(message?: string) {
  try { localStorage.setItem(demoMode ? DEMO_STORE_KEY : STORE_KEY, JSON.stringify(store)); }
  catch { storageError = 'This browser could not save locally. Export this recap before leaving.'; }
  if (message) announce(message);
  render();
}

function announce(message: string) {
  toast = message;
  window.setTimeout(() => {
    if (toast === message) { toast = ''; document.querySelector('[data-toast]')?.remove(); }
  }, 3500);
}

function cachedPaid() {
  try { return JSON.parse(localStorage.getItem(VERDICT_KEY) || '{}').valid === true; } catch { return false; }
}

async function checkLicense() {
  const params = new URLSearchParams(location.search);
  const returned = params.get('license');
  if (returned) {
    localStorage.setItem(LICENSE_KEY, returned);
    localStorage.removeItem(VERDICT_KEY);
    params.delete('license');
    history.replaceState({}, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  }
  const token = localStorage.getItem(LICENSE_KEY);
  if (!token) return;
  let verdict: { valid?: boolean; checkedAt?: number } = {};
  try { verdict = JSON.parse(localStorage.getItem(VERDICT_KEY) || '{}'); } catch { /* recheck */ }
  if (!returned && verdict.checkedAt && Date.now() - verdict.checkedAt < 86_400_000) return;
  try {
    const response = await fetch(`${BILLING}/verify?license=${encodeURIComponent(token)}`);
    const result = await response.json();
    paid = result.valid === true;
    localStorage.setItem(VERDICT_KEY, JSON.stringify({ valid: paid, reason: result.reason, checkedAt: Date.now() }));
    render();
  } catch { /* cached access remains available while offline */ }
}

function shell(content: string, extra = '') {
  return `<a class="skip-link" href="#main">Skip to main content</a><header class="topbar">
    <a class="brand" href="/" aria-label="Tutor Session Trace home"><span class="brand-mark" aria-hidden="true">⌁</span><span>Tutor Session Trace</span></a>
    <nav aria-label="Primary"><a href="/demo">Demo</a><button class="quiet-button" data-settings>Plan & settings</button></nav>
  </header>
  ${demoMode ? '<aside class="demo-banner" aria-label="Demo mode"><strong>Demo — sample data, nothing is saved to your notebook</strong><span><button data-reset-demo>Reset demo</button><button data-leave-demo>Start for real</button></span></aside>' : ''}
  ${!navigator.onLine ? '<div class="offline" role="status">Offline — local notes still work; sharing will wait for a connection.</div>' : ''}
  ${storageError ? `<div class="error-banner" role="alert">${escapeHtml(storageError)}</div>` : ''}
  ${content}
  <footer><span>Session notes for one-to-one coding tutors.</span><span class="footer-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span class="footer-build">Built by Param Factory · v1.0.0</span></span></footer>
  <div class="toast" data-toast aria-live="polite">${escapeHtml(toast)}</div>${extra}`;
}

function focusRouteHeading() {
  window.requestAnimationFrame(() => {
    const heading = app.querySelector<HTMLElement>('main h1');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
    if (routeStatus) routeStatus.textContent = `${document.title}.`;
  });
}

function render(focusHeading = false) {
  const nextDemoMode = location.pathname === '/demo' || new URLSearchParams(location.search).get('demo') === '1';
  if (nextDemoMode !== demoMode) {
    demoMode = nextDemoMode;
    store = loadStore();
  }
  const path = location.pathname;
  if (path === '/privacy' || path === '/terms') return renderLegal(path, focusHeading);
  if (path.startsWith('/s/')) return void renderShared(path.slice(3), focusHeading);
  renderNotebook(focusHeading);
}

function renderNotebook(focusHeading = false) {
  document.title = demoMode ? 'Demo — Tutor Session Trace' : 'Tutor Session Trace — record coding lesson notes';
  const active = store.sessions.find(session => session.id === store.activeId) || store.sessions[0];
  if (active && store.activeId !== active.id) store.activeId = active.id;
  app.innerHTML = shell(`<main id="main" tabindex="-1" class="notebook-shell ${active ? 'has-session' : 'is-empty'}">
    <aside class="session-rail" aria-label="Session notebook">
      <div class="rail-heading"><div><span class="eyebrow">Session list</span><p class="rail-title">Sessions</p></div><span class="plan-stamp">${paid ? 'Full plan' : `${store.sessions.length}/5 free`}</span></div>
      ${store.sessions.length ? `<label class="search-label" for="session-search">Find a session</label><input id="session-search" type="search" placeholder="Student or topic" autocomplete="off"><ol class="session-list">${store.sessions.map(session => `<li><button data-session="${session.id}" class="session-tab ${active?.id === session.id ? 'active' : ''}"><strong>${escapeHtml(session.student)}</strong><span>${escapeHtml(session.topic)}</span><time datetime="${session.date}">${formatDate(session.date)}</time></button></li>`).join('')}</ol>` : ''}
      <form class="new-session" data-new-session>
        <p class="rail-form-title">${store.sessions.length ? 'Start another session' : 'Start your first trace'}</p>
        <p>Only the tutor’s browser stores this notebook.</p>
        <label for="student">Student name</label><input id="student" name="student" required maxlength="80" autocomplete="off">
        <label for="topic">Session topic</label><input id="topic" name="topic" required maxlength="120" placeholder="e.g. Tracing recursive calls">
        <label for="session-date">Date</label><input id="session-date" name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}">
        <button class="primary" type="submit" ${!paid && store.sessions.length >= 5 ? 'disabled aria-describedby="free-limit"' : ''}>Open session page</button>
        ${!paid && store.sessions.length >= 5 ? '<p id="free-limit" class="field-note">Free notebooks hold five sessions. Delete one or get unlimited history.</p>' : ''}
      </form>
    </aside>
    <section class="workspace" aria-label="Active session">${active ? sessionView(active) : emptyView()}</section>
  </main>`, settingsDialog());
  bindCommon();
  bindNotebook(active);
  if (focusHeading) focusRouteHeading();
}

function emptyView() {
  return `<div class="landing-page"><div class="empty-state"><div class="empty-copy"><span class="eyebrow">Tutor Session Trace</span><h1>Record coding lessons and share next steps</h1><p>For one-to-one coding tutors who need useful notes without leaving the call or shared editor.</p><ul><li><span>01</span> Five sessions are free</li><li><span>02</span> Local notes work offline</li><li><span>03</span> Sharing requires student consent</li></ul><div class="first-actions"><button class="primary" data-start-demo>Try it with sample data</button><a class="button-link" href="#student">Start your first session</a></div><p class="action-note">The demo opens a finished lesson trace. It never reads or changes your notebook.</p></div><picture class="hero-art"><source media="(max-width: 700px)" srcset="/assets/field-notebook-720.webp"><img src="/assets/field-notebook-1280.webp" width="1280" height="853" fetchpriority="high" alt="An open field notebook with timeline rules, pressed ferns, and writing tools arranged on a tutor's desk."></picture></div><div class="landing-details"><section aria-labelledby="how-it-works"><span class="eyebrow">Three steps</span><h2 id="how-it-works">How it works</h2><ol class="how-steps"><li><strong>Open a session</strong><span>Add the student, topic, and lesson date.</span></li><li><strong>Record attempts</strong><span>Keep moments, a summary, and a next practice task.</span></li><li><strong>Share the recap</strong><span>Record consent, then send an expiring student link.</span></li></ol></section><section aria-labelledby="privacy-and-limits"><span class="eyebrow">Boundaries</span><h2 id="privacy-and-limits">Privacy and limits</h2><p>It does not run calls, edit repositories, execute code, or replace a learning system.</p><p>Tutor-only notes are excluded from student recaps and exports.</p></section><section aria-labelledby="full-notebook-plan"><span class="eyebrow">One-time purchase</span><h2 id="full-notebook-plan">Full notebook plan</h2><p>$19 one time adds unlimited local history and 1–30 day recap expiry choices.</p><button data-settings>See plan and license options</button></section></div></div>`;
}

function sessionView(session: TraceSession) {
  return `<article class="session-page" data-active="${session.id}">
    <header class="session-header"><div><span class="eyebrow">Session · ${formatDate(session.date)}</span><h1>${escapeHtml(session.topic)}</h1><p>with ${escapeHtml(session.student)}</p></div><div class="header-actions"><button data-export-md>Export Markdown</button><button data-print>Print / PDF</button><button class="icon-button danger-text" data-delete-session aria-label="Delete this session">Delete</button></div></header>
    <div class="session-grid"><div class="record-column">
      <section class="capture" aria-labelledby="capture-title"><div class="section-title"><div><span class="specimen-number">Live capture</span><h2 id="capture-title">Add a lesson moment</h2></div><span class="shortcut" aria-hidden="true">⌘ / Ctrl + Enter</span></div>
        <form data-moment-form><label for="moment-note">What did you observe?</label><textarea id="moment-note" name="note" required maxlength="2000" rows="3" placeholder="The student changed the base case and explained why…"></textarea>
          <div class="capture-fields"><label>Moment type<select name="kind"><option value="attempt">Attempt</option><option value="breakthrough">Breakthrough</option><option value="handoff">Handoff</option></select></label><label>Outcome<select name="outcome"><option value="progressing">Progressing</option><option value="stuck">Stuck</option><option value="solved">Solved</option></select></label><label>Attach<select name="attachmentType" data-attachment-type><option value="">Nothing</option><option value="link">Link</option><option value="code">Code snippet</option></select></label></div>
          <div class="attachment-field" hidden><label for="attachment-value">Link or code snippet</label><textarea id="attachment-value" name="attachment" rows="3" maxlength="8000" aria-describedby="attachment-help attachment-error" placeholder="Paste only the useful fragment—not credentials or a private repository."></textarea><p id="attachment-help" class="field-note">Use a complete http:// or https:// address. Never paste credentials.</p><p id="attachment-error" class="form-error" role="alert" hidden></p></div>
          <div class="capture-submit"><label class="check-label"><input type="checkbox" name="private"> Tutor-only note</label><button class="primary" type="submit">Record moment</button></div>
        </form>
      </section>
      <section class="timeline-section" aria-labelledby="timeline-title"><div class="section-title"><div><span class="specimen-number">Moments ${String(session.moments.length).padStart(2, '0')}</span><h2 id="timeline-title">Attempt timeline</h2></div></div>${timeline(session)}</section>
    </div><aside class="recap-column" aria-label="Student recap">
      <section><span class="specimen-number">Recap note</span><h2>What to remember</h2><label class="sr-only" for="summary">Student-visible session summary</label><textarea id="summary" data-summary rows="5" maxlength="2000" placeholder="Name the idea that should stick…">${escapeHtml(session.summary)}</textarea></section>
      <section><span class="specimen-number">Next practice</span><h2>Continue from here</h2><form class="task-form" data-task-form><label class="sr-only" for="task">New practice task</label><input id="task" name="task" required maxlength="240" placeholder="Add a small, concrete task"><button type="submit" aria-label="Add practice task">Add</button></form>${tasks(session)}</section>
      <section class="share-panel"><span class="specimen-number">Student copy</span><h2>Share the trace</h2><label class="consent"><input type="checkbox" data-consent ${session.consent ? 'checked' : ''}><span><strong>Student consent recorded</strong><small>The student agreed that these lesson notes may be shared. Tutor-only notes never leave this browser.</small></span></label>${shareControls(session)}</section>
    </aside></div>
  </article>`;
}

function timeline(session: TraceSession) {
  if (!session.moments.length) return `<div class="timeline-empty"><span aria-hidden="true">⌁</span><p>Your first observation will appear here with its time and outcome.</p></div>`;
  return `<ol class="timeline">${session.moments.map((item, index) => {
    const href = item.attachment?.type === 'link' ? safeLink(item.attachment.value) : null;
    return `<li class="moment moment-${item.outcome}${item.private ? ' moment-private' : ''}"><div class="moment-marker" aria-hidden="true">${index + 1}</div><article><header><time datetime="${item.at}">${formatTime(item.at)}</time><span class="tag kind">${label(item.kind)}</span><span class="tag outcome">${label(item.outcome)}</span>${item.private ? '<span class="tag private">Tutor only</span>' : ''}</header><p>${escapeHtml(item.note)}</p>${href ? `<a class="attachment link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open attached link <span aria-hidden="true">↗</span></a>` : ''}${item.attachment?.type === 'code' ? `<pre class="attachment"><code>${escapeHtml(item.attachment.value)}</code></pre>` : ''}<button class="delete-small" data-delete-moment="${item.id}">Remove</button></article></li>`;
  }).join('')}</ol>`;
}

function tasks(session: TraceSession) {
  if (!session.tasks.length) return '<p class="field-note">Aim for one task small enough to begin alone.</p>';
  return `<ul class="task-list">${session.tasks.map(task => `<li><label><input type="checkbox" data-task-done="${task.id}" ${task.done ? 'checked' : ''}><span>${escapeHtml(task.text)}</span></label><button data-delete-task="${task.id}" aria-label="Remove task: ${escapeHtml(task.text)}">×</button></li>`).join('')}</ul>`;
}

function shareControls(session: TraceSession) {
  if (session.share) return `<div class="share-result">${!session.consent ? '<p class="consent-warning">Consent is no longer recorded. Delete this shared copy now.</p>' : ''}<label for="share-url">Student link · expires ${formatDate(session.share.expiresAt)}</label><div><input id="share-url" readonly value="${escapeHtml(session.share.url)}"><button data-copy-share>Copy</button></div><p>${session.share.opens} recorded ${session.share.opens === 1 ? 'open' : 'opens'} <button class="text-button" data-refresh-opens>Refresh</button></p><button class="text-button danger-text" data-unshare>Delete shared copy now</button></div>`;
  if (!session.consent) return '<p class="consent-needed">Record consent to create a student link.</p>';
  return `<form data-share-form><label for="expiry">Link expiry</label><select id="expiry" name="days">${paid ? '<option value="1">1 day</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option>' : '<option value="7">7 days · free plan</option>'}</select><button class="primary wide" type="submit">Create student link</button><p class="field-note">Only student-visible notes and tasks are copied to the server.</p></form>`;
}

function settingsDialog() {
  return `<dialog id="settings"><form method="dialog" class="dialog-close"><button aria-label="Close plan and settings">×</button></form><span class="eyebrow">Plan & settings</span><h2>${paid ? 'Full plan active' : 'Full notebook plan'}</h2>${paid ? '<p>Your license is active. Keep unlimited local session history and choose share expiry from 1 to 30 days.</p>' : '<p>The free notebook includes five local sessions, seven-day share links, and all exports. A one-time purchase adds unlimited client history and configurable share expiry.</p><p class="price">$19 <small>one time</small></p><a class="primary button-link wide" href="https://api.sociobot.in/api/v1/products/tutor-session-trace/checkout">Buy the full notebook</a>'}<hr><form data-license-form><label for="license">Have a license? Paste it here</label><input id="license" name="license" autocomplete="off" required><button type="submit">Verify license</button></form>${localStorage.getItem(LICENSE_KEY) && !paid ? '<p class="license-note">License no longer active or not yet verified. Check the token or purchase a new license.</p>' : ''}<p class="legal-note">Sociobot/Dodo is the merchant of record. Refunds are handled there and revoke the license. <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></dialog>`;
}

function bindCommon() {
  document.querySelectorAll<HTMLElement>('[data-settings]').forEach(button => button.addEventListener('click', () => (document.querySelector<HTMLDialogElement>('#settings')?.showModal())));
  document.querySelector<HTMLButtonElement>('[data-start-demo]')?.addEventListener('click', () => {
    localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(sampleStore()));
    location.assign('/demo');
  });
  document.querySelector<HTMLButtonElement>('[data-reset-demo]')?.addEventListener('click', () => {
    store = sampleStore();
    save('Demo reset.');
  });
  document.querySelector<HTMLButtonElement>('[data-leave-demo]')?.addEventListener('click', () => {
    localStorage.removeItem(DEMO_STORE_KEY);
    location.assign('/');
  });
  document.querySelector<HTMLFormElement>('[data-license-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    localStorage.setItem(LICENSE_KEY, String(data.get('license')).trim());
    localStorage.removeItem(VERDICT_KEY);
    (document.querySelector<HTMLDialogElement>('#settings'))?.close();
    announce('License saved. Checking it now…'); render(); void checkLicense();
  });
}

function bindNotebook(active?: TraceSession) {
  document.querySelector<HTMLFormElement>('[data-new-session]')?.addEventListener('submit', event => {
    event.preventDefault();
    if (!paid && store.sessions.length >= 5) return;
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const session: TraceSession = { id: newId(), student: String(data.get('student')).trim(), topic: String(data.get('topic')).trim(), date: String(data.get('date')), createdAt: new Date().toISOString(), summary: '', consent: false, moments: [], tasks: [] };
    store.sessions.unshift(session); store.activeId = session.id; save('Session page opened.');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-session]').forEach(button => button.addEventListener('click', () => { store.activeId = button.dataset.session; save(); }));
  document.querySelector<HTMLInputElement>('#session-search')?.addEventListener('input', event => {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    document.querySelectorAll<HTMLElement>('.session-list li').forEach(item => { item.hidden = !item.textContent!.toLowerCase().includes(query); });
  });
  if (!active) return;
  document.querySelector<HTMLSelectElement>('[data-attachment-type]')?.addEventListener('change', event => {
    const holder = document.querySelector<HTMLElement>('.attachment-field')!;
    holder.hidden = !(event.target as HTMLSelectElement).value;
  });
  const momentForm = document.querySelector<HTMLFormElement>('[data-moment-form]');
  momentForm?.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) momentForm.requestSubmit(); });
  const attachmentField = momentForm?.elements.namedItem('attachment') as HTMLTextAreaElement | null;
  attachmentField?.addEventListener('input', () => {
    attachmentField.removeAttribute('aria-invalid');
    const error = document.querySelector<HTMLElement>('#attachment-error');
    if (error) { error.hidden = true; error.textContent = ''; }
  });
  momentForm?.addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement);
    const attachmentType = String(data.get('attachmentType')) as '' | 'link' | 'code'; const attachmentValue = String(data.get('attachment')).trim();
    if (attachmentType === 'link' && !safeLink(attachmentValue)) {
      const message = 'Use a complete http:// or https:// link.';
      const error = document.querySelector<HTMLElement>('#attachment-error');
      if (error) { error.textContent = message; error.hidden = false; }
      attachmentField?.setAttribute('aria-invalid', 'true');
      attachmentField?.focus();
      announce(message);
      return;
    }
    active.moments.unshift({ id: newId(), at: new Date().toISOString(), kind: String(data.get('kind')) as never, outcome: String(data.get('outcome')) as never, note: String(data.get('note')).trim(), attachment: attachmentType && attachmentValue ? { type: attachmentType, value: attachmentValue } : undefined, private: data.get('private') === 'on' });
    save('Moment recorded.');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-moment]').forEach(button => button.addEventListener('click', () => {
    const item = active.moments.find(moment => moment.id === button.dataset.deleteMoment);
    if (item && confirm(`Remove this ${item.kind}: “${item.note.slice(0, 60)}”?`)) { active.moments = active.moments.filter(moment => moment.id !== item.id); save('Moment removed.'); }
  }));
  document.querySelector<HTMLTextAreaElement>('[data-summary]')?.addEventListener('change', event => { active.summary = (event.target as HTMLTextAreaElement).value; save('Recap note saved.'); });
  document.querySelector<HTMLFormElement>('[data-task-form]')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); active.tasks.push({ id: newId(), text: String(data.get('task')).trim(), done: false }); save('Next practice added.'); });
  document.querySelectorAll<HTMLInputElement>('[data-task-done]').forEach(box => box.addEventListener('change', () => { const task = active.tasks.find(item => item.id === box.dataset.taskDone); if (task) task.done = box.checked; save(box.checked ? 'Practice marked complete.' : 'Practice marked open.'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-delete-task]').forEach(button => button.addEventListener('click', () => { active.tasks = active.tasks.filter(item => item.id !== button.dataset.deleteTask); save('Practice item removed.'); }));
  document.querySelector<HTMLInputElement>('[data-consent]')?.addEventListener('change', event => { active.consent = (event.target as HTMLInputElement).checked; save(active.consent ? 'Consent recorded.' : 'Consent removed. Existing links remain until deleted.'); });
  document.querySelector<HTMLButtonElement>('[data-delete-session]')?.addEventListener('click', () => {
    if (active.share) { announce('Delete the shared copy before deleting this local session.'); render(); return; }
    if (confirm(`Delete the local session “${active.topic}” for ${active.student}? This cannot be undone.`)) { store.sessions = store.sessions.filter(item => item.id !== active.id); store.activeId = store.sessions[0]?.id; save('Local session deleted.'); }
  });
  document.querySelector<HTMLButtonElement>('[data-export-md]')?.addEventListener('click', () => download(`${slug(active.student)}-${slug(active.topic)}.md`, sessionMarkdown(active), 'text/markdown'));
  document.querySelector<HTMLButtonElement>('[data-print]')?.addEventListener('click', () => window.print());
  document.querySelector<HTMLFormElement>('[data-share-form]')?.addEventListener('submit', event => void createShare(event, active));
  document.querySelector<HTMLButtonElement>('[data-copy-share]')?.addEventListener('click', () => void copyText(active.share!.url));
  document.querySelector<HTMLButtonElement>('[data-refresh-opens]')?.addEventListener('click', () => void refreshOpens(active));
  document.querySelector<HTMLButtonElement>('[data-unshare]')?.addEventListener('click', () => void deleteShare(active));
}

async function createShare(event: SubmitEvent, session: TraceSession) {
  event.preventDefault(); if (!session.consent) return;
  if (demoMode) { announce('Demo notes stay in this browser. Start for real to create a student link.'); render(); return; }
  const button = (event.currentTarget as HTMLFormElement).querySelector('button')!; button.disabled = true; button.textContent = 'Creating link…';
  try {
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const license = localStorage.getItem(LICENSE_KEY)?.trim();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (license) headers['x-sociobot-license'] = license;
    const response = await fetch('/api/shares', { method: 'POST', headers, body: JSON.stringify({ ...studentRecap(session), consent: true, expires_days: Number(data.get('days')) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The link could not be created.');
    session.share = { id: result.id, url: `${location.origin}/s/${result.id}`, deleteKey: result.delete_key, expiresAt: result.expires_at, opens: 0 }; save('Student link created.');
  } catch (error) { announce(navigator.onLine ? String((error as Error).message) : 'You are offline. Your local notes are safe; try sharing when reconnected.'); render(); }
}

async function refreshOpens(session: TraceSession) {
  if (!session.share) return;
  try { const response = await fetch(`/api/shares/${session.share.id}/status?key=${encodeURIComponent(session.share.deleteKey)}`); const result = await response.json(); if (!response.ok) throw new Error(result.error); session.share.opens = result.opens; save('Open count refreshed.'); }
  catch { announce('Could not refresh opens. Check your connection.'); render(); }
}

async function deleteShare(session: TraceSession) {
  if (!session.share || !confirm('Delete this student-visible copy now? The link will stop working immediately.')) return;
  try { const response = await fetch(`/api/shares/${session.share.id}?key=${encodeURIComponent(session.share.deleteKey)}`, { method: 'DELETE' }); if (!response.ok) throw new Error(); session.share = undefined; save('Shared copy deleted.'); }
  catch { announce('Could not delete the shared copy. Check your connection and try again.'); render(); }
}

async function renderShared(id: string, focusHeading = false) {
  app.innerHTML = `<a class="skip-link" href="#main">Skip to main content</a><main id="main" class="shared-loading" tabindex="-1"><h1>Opening session trace…</h1><p>Gathering the student-visible notes.</p></main>`;
  if (focusHeading) focusRouteHeading();
  try {
    const response = await fetch(`/api/shares/${encodeURIComponent(id)}`); const data = await response.json();
    if (!response.ok) throw new Error(response.status === 410 ? 'This recap has expired.' : 'This recap could not be found.');
    document.title = `${data.session_title} — Tutor Session Trace`;
    app.innerHTML = `<a class="skip-link" href="#main">Skip to main content</a><header class="shared-top"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">⌁</span><span>Tutor Session Trace</span></a><span>Student recap</span></header><main id="main" class="shared-sheet" tabindex="-1"><header><span class="eyebrow">Session recap · ${formatDate(data.session_date)}</span><h1>${escapeHtml(data.session_title)}</h1><p>Prepared for ${escapeHtml(data.student_name)}</p></header>${data.summary ? `<section><span class="specimen-number">What to remember</span><h2>Session note</h2><p class="lead">${escapeHtml(data.summary)}</p></section>` : ''}<section><span class="specimen-number">What happened</span><h2>Attempt timeline</h2>${sharedMoments(data.moments)}</section><section><span class="specimen-number">Continue from here</span><h2>Next practice</h2>${data.next_tasks.length ? `<ul class="shared-tasks">${data.next_tasks.map((task: { text: string; done: boolean }) => `<li class="${task.done ? 'done' : ''}"><span aria-hidden="true">${task.done ? '✓' : '→'}</span>${escapeHtml(task.text)}</li>`).join('')}</ul>` : '<p>No next-practice tasks were added.</p>'}</section><aside class="student-note">This page contains only notes your tutor marked as student-visible. It expires automatically on ${formatDate(data.expires_at)}.</aside></main><footer><span>Student recap from Tutor Session Trace.</span><span class="footer-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span class="footer-build">Built by Param Factory · v1.0.0</span></span></footer>`;
    if (focusHeading) focusRouteHeading();
  } catch (error) {
    if (!navigator.onLine) {
      app.innerHTML = `<a class="skip-link" href="#main">Skip to main content</a><main id="main" class="shared-error" tabindex="-1"><span class="error-specimen" aria-hidden="true">⌁</span><h1>You’re offline</h1><p>Reconnect to open this saved recap link. The link may still be valid.</p><button class="primary" data-retry-shared>Try again</button><a href="/">About Tutor Session Trace</a></main>`;
      document.querySelector<HTMLButtonElement>('[data-retry-shared]')?.addEventListener('click', () => void renderShared(id));
      if (focusHeading) focusRouteHeading();
      return;
    }
    app.innerHTML = `<a class="skip-link" href="#main">Skip to main content</a><main id="main" class="shared-error" tabindex="-1"><span class="error-specimen" aria-hidden="true">×</span><h1>${escapeHtml((error as Error).message)}</h1><p>Ask your tutor for a fresh link. No sign-in is needed.</p><a href="/">About Tutor Session Trace</a></main>`;
    if (focusHeading) focusRouteHeading();
  }
}

function sharedMoments(items: Array<{ at: string; kind: string; outcome: string; note: string; attachment?: { type: string; value: string } }>) {
  if (!items.length) return '<p>No student-visible observations were added.</p>';
  return `<ol class="shared-timeline">${items.map(item => { const href = item.attachment?.type === 'link' ? safeLink(item.attachment.value) : null; return `<li><div><time>${formatTime(item.at)}</time><span class="tag">${escapeHtml(label(item.kind))}</span><span class="tag">${escapeHtml(label(item.outcome))}</span></div><p>${escapeHtml(item.note)}</p>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open attached reference ↗</a>` : ''}${item.attachment?.type === 'code' ? `<pre><code>${escapeHtml(item.attachment.value)}</code></pre>` : ''}</li>`; }).join('')}</ol>`;
}

function renderLegal(path: string, focusHeading = false) {
  const privacy = path === '/privacy'; document.title = `${privacy ? 'Privacy' : 'Terms'} — Tutor Session Trace`;
  const content = privacy ? `<h1>Privacy, in plain language</h1><p class="lead">Your working notebook stays in this browser. We do not run analytics, advertising, or cross-site tracking.</p><h2>What is stored</h2><p>Session names, moments, attachments, consent, and practice tasks use your browser’s local storage.</p><p>We receive a student recap only when you choose “Create student link.”</p><p>Shared recaps contain the student name, date, topic, visible moments, and practice tasks. Tutor-only notes are excluded.</p><h2>How long</h2><p>Shared copies expire after the period shown before creation.</p><p>The free plan has seven-day links. An active license offers links from 1 to 30 days.</p><p>Tutors can delete a shared copy early. Expired records are removed by routine cleanup.</p><p>Local notes remain until the tutor deletes them or clears browser data.</p><h2>Billing</h2><p>Sociobot/Dodo handles checkout and license verification.</p><p>This app stores the license token and a daily verification result locally. It never receives card details.</p><h2>Your choices</h2><p>Export or delete local sessions at any time.</p><p>Ask the tutor who sent a recap to delete the shared copy.</p><p>Do not put passwords, credentials, or full private repositories in a trace.</p>` : `<h1>Terms of use</h1><p class="lead">Tutor Session Trace is a teaching record. It is not an LMS, code host, recording service, or assessment tool.</p><h2>Using the service</h2><p>You need a student’s permission before creating a shared recap.</p><p>Add only information you are entitled to store and share.</p><p>Do not include credentials, secrets, full private repositories, unlawful content, or unnecessary sensitive information.</p><h2>Free and paid use</h2><p>The free plan includes five local sessions, seven-day links, and exports.</p><p>A $19 one-time license adds unlimited local history and configurable link expiry.</p><p>Sociobot/Dodo is merchant of record and handles refunds. A refund revokes the license.</p><h2>Availability</h2><p>The service is provided “as is.”</p><p>Local notes work offline. Link creation, opening, and deletion need the service.</p><p>Keep exports for records you cannot afford to lose.</p><h2>Acceptable use</h2><p>Do not probe, overload, scrape, or use the service to distribute harmful content.</p><p>Shared links are unlisted. They are not access control for highly sensitive data.</p>`;
  app.innerHTML = shell(`<main id="main" class="legal-page" tabindex="-1"><a class="back-link" href="/">← Back to notebook</a><article>${content}<p class="legal-date">Effective 27 August 2026</p></article></main>`, settingsDialog()); bindCommon();
  if (focusHeading) focusRouteHeading();
}

function formatDate(value: string) { const date = new Date(value.length === 10 ? `${value}T12:00:00` : value); return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date); }
function sampleStore(): TraceStore {
  const session: TraceSession = {
    id: 'demo-recursive-tree', student: 'Mina', topic: 'Tracing recursive trees', date: '2026-08-29', createdAt: '2026-08-29T10:00:00Z',
    summary: 'Name the base case before following each branch.', consent: false,
    moments: [
      { id: 'demo-3', at: '2026-08-29T10:31:00Z', kind: 'handoff', outcome: 'solved', note: 'Explained why the empty child returns zero.', private: false },
      { id: 'demo-2', at: '2026-08-29T10:18:00Z', kind: 'breakthrough', outcome: 'progressing', note: 'Drew the left branch and matched each return value.', attachment: { type: 'code', value: 'if (node == null) return 0;' }, private: false },
      { id: 'demo-1', at: '2026-08-29T10:07:00Z', kind: 'attempt', outcome: 'stuck', note: 'Ask about call-stack confidence next time.', private: true },
    ],
    tasks: [
      { id: 'demo-task-1', text: 'Trace a tree of depth three on paper.', done: false },
      { id: 'demo-task-2', text: 'Write one recursive base case from memory.', done: true },
    ],
  };
  return { activeId: session.id, sessions: [session] };
}
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); announce('Markdown exported.'); render(); }
async function copyText(value: string) { try { await navigator.clipboard.writeText(value); announce('Student link copied.'); render(); } catch { const input = document.querySelector<HTMLInputElement>('#share-url'); input?.select(); announce('Select and copy the link manually.'); render(); } }

window.addEventListener('online', () => { announce('Back online. Sharing is available.'); render(); });
window.addEventListener('offline', () => render());
window.addEventListener('popstate', () => render(true));
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
  if (anchor.classList.contains('skip-link')) {
    event.preventDefault();
    document.querySelector<HTMLElement>('#main')?.focus();
    return;
  }
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  const knownRoute = url.pathname === '/' || url.pathname === '/demo' || url.pathname === '/privacy' || url.pathname === '/terms' || url.pathname.startsWith('/s/');
  if (!knownRoute) return;
  event.preventDefault();
  history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  window.scrollTo({ top: 0, behavior: 'auto' });
  render(true);
});
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));

render();
void checkLicense();
