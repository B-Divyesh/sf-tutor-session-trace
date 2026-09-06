import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';

const base = (process.env.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const requestedClaim = process.argv.find(argument => argument.startsWith('@'));
const workerChrome = '/opt/pw-browsers/chromium-1208/chrome-linux64/chrome';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(workerChrome) ? workerChrome : undefined);
const browser = await chromium.launch({ executablePath });

async function run(name, claim, check) {
  if (requestedClaim && requestedClaim !== claim) return;
  await check();
  console.log(`passed ${claim} ${name}`);
}

await run('print and Markdown exclude tutor-only notes', '@claim:private-exports', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await page.getByLabel('Student name').fill('Mina');
  await page.getByLabel('Session topic').fill('Print privacy regression');
  await page.getByRole('button', { name: 'Open session page' }).click();

  const note = page.getByLabel('What did you observe?');
  await note.fill('Observation survives invalid link');
  await page.getByLabel('Moment type').selectOption('breakthrough');
  await page.getByLabel('Outcome').selectOption('stuck');
  await page.getByLabel('Attach').selectOption('link');
  await page.getByLabel('Link or code snippet').fill('javascript:alert(1)');
  await page.getByLabel('Tutor-only note', { exact: true }).check();
  await page.getByRole('button', { name: 'Record moment' }).click();
  if (await note.inputValue() !== 'Observation survives invalid link') throw new Error('Invalid link erased the observation');
  if (await page.getByLabel('Attach').inputValue() !== 'link') throw new Error('Invalid link reset the attachment type');
  if (await page.getByLabel('Link or code snippet').inputValue() !== 'javascript:alert(1)') throw new Error('Invalid link erased the attachment');
  if (!(await page.getByLabel('Tutor-only note', { exact: true }).isChecked())) throw new Error('Invalid link reset tutor-only state');
  if (!(await page.getByText('Use a complete http:// or https:// link.', { exact: true }).isVisible())) throw new Error('Invalid link error is not visible');
  if (await page.locator('.moment').count()) throw new Error('Invalid link created a moment');

  await page.getByLabel('Link or code snippet').fill('https://example.com/private-reference');
  await page.getByRole('button', { name: 'Record moment' }).click();
  await note.fill('PUBLIC PDF NOTE');
  await page.getByLabel('Tutor-only note', { exact: true }).uncheck();
  await page.getByLabel('Attach').selectOption('');
  await page.getByRole('button', { name: 'Record moment' }).click();

  await page.emulateMedia({ media: 'print' });
  const printEvidence = await page.evaluate(() => {
    const privateMoment = document.querySelector('.moment-private');
    return {
      privateDisplay: privateMoment ? getComputedStyle(privateMoment).display : null,
      hasPublic: document.body.innerText.includes('PUBLIC PDF NOTE'),
      hasPrivate: document.body.innerText.includes('Observation survives invalid link'),
    };
  });
  if (printEvidence.privateDisplay !== 'none' || !printEvidence.hasPublic || printEvidence.hasPrivate) {
    throw new Error(`Print privacy failed: ${JSON.stringify(printEvidence)}`);
  }
  const pdf = await page.pdf({ printBackground: true, tagged: true });
  if (pdf.length < 1_000) throw new Error(`Generated PDF was unexpectedly small: ${pdf.length} bytes`);

  await page.emulateMedia({ media: 'screen' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const markdown = await (await download).createReadStream();
  let markdownText = '';
  for await (const chunk of markdown) markdownText += chunk.toString();
  if (!markdownText.includes('PUBLIC PDF NOTE') || markdownText.includes('Observation survives invalid link')) {
    throw new Error('Markdown privacy regression');
  }
  await page.getByLabel(/Student consent recorded/).check();
  await page.getByRole('button', { name: 'Create student link' }).click();
  const shareUrl = await page.getByLabel(/Student link/).inputValue();
  const recap = await context.newPage();
  await recap.goto(shareUrl, { waitUntil: 'networkidle' });
  const recapText = await recap.locator('main').innerText();
  if (!recapText.includes('PUBLIC PDF NOTE') || recapText.includes('Observation survives invalid link')) {
    throw new Error('Student recap privacy regression');
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tutor-session-trace:v1') || '{}'));
  const shared = stored.sessions?.[0]?.share;
  if (shared) await context.request.delete(`${base}/api/shares/${shared.id}?key=${encodeURIComponent(shared.deleteKey)}`);
  await context.close();
});

await run('PWA has suitable install icons', '@claim:pwa-installable', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  if (!manifest.icons?.some(icon => icon.sizes === '192x192') || !manifest.icons?.some(icon => icon.sizes === '512x512')) {
    throw new Error(`Manifest lacks suitable install icons: ${JSON.stringify(manifest.icons)}`);
  }
  for (const icon of manifest.icons) {
    const response = await context.request.get(new URL(icon.src, base).href);
    if (!response.ok() || response.headers()['content-type'] !== 'image/png') throw new Error(`PWA icon failed: ${icon.src}`);
  }
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  const iconErrors = installabilityErrors.filter(error => ['manifest-missing-suitable-icon', 'no-acceptable-icon'].includes(error.errorId));
  if (iconErrors.length) throw new Error(`PWA icon installability errors: ${JSON.stringify(iconErrors)}`);
  await context.close();
});

await run('local capture reloads offline and recaps explain that opening needs a connection', '@claim:offline-local-capture', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByLabel('Student name').fill('Offline learner');
  await page.getByLabel('Session topic').fill('Offline local capture');
  await page.getByRole('button', { name: 'Open session page' }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (!(await page.getByRole('heading', { name: 'Offline local capture' }).isVisible())) throw new Error('Saved local session did not reload offline');
  await page.getByLabel('What did you observe?').fill('Captured without a connection.');
  await page.getByRole('button', { name: 'Record moment' }).click();
  if (!(await page.getByText('Captured without a connection.').isVisible())) throw new Error('Local moment could not be captured offline');
  await context.setOffline(false);

  const created = await context.request.post(`${base}/api/shares`, {
    data: {
      student_name: 'Offline learner', session_title: 'Offline recap state', session_date: '2026-08-30',
      summary: 'A valid recap that needs the network to reopen.', moments: [], next_tasks: [], consent: true, expires_days: 7,
    },
  });
  if (created.status() !== 201) throw new Error(`Could not create recap fixture: ${created.status()} ${await created.text()}`);
  const share = await created.json();
  await page.goto(`${base}/s/${share.id}`, { waitUntil: 'networkidle' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'You’re offline', exact: true }).waitFor();
  const offlineText = await page.locator('main').innerText();
  if (offlineText.includes('fresh link') || offlineText.includes('Failed to fetch')) throw new Error(`Offline recap gives misleading advice: ${offlineText}`);
  if (!(await page.getByRole('button', { name: 'Try again' }).isVisible())) throw new Error('Offline recap has no retry action');
  const axe = await new AxeBuilder({ page }).analyze();
  const serious = axe.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  if (serious.length) throw new Error(`Offline recap accessibility violations: ${JSON.stringify(serious)}`);
  await context.setOffline(false);
  await context.request.delete(`${base}/api/shares/${share.id}?key=${encodeURIComponent(share.delete_key)}`);
  await context.close();
});

await run('demo uses isolated sample storage', '@claim:demo-sandbox', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  const realStore = { activeId: 'real', sessions: [{ id: 'real', student: 'Real student', topic: 'Real notebook sentinel', date: '2026-08-30', createdAt: '2026-08-30T10:00:00Z', summary: '', consent: false, moments: [], tasks: [] }] };
  await page.evaluate(value => {
    localStorage.clear();
    localStorage.setItem('tutor-session-trace:v1', JSON.stringify(value));
  }, realStore);
  await page.getByRole('button', { name: 'Try it with sample data' }).click();
  await page.waitForURL(`${base}/demo`);
  if (!(await page.getByText('Demo — sample data, nothing is saved to your notebook').isVisible())) throw new Error('Demo banner is missing');
  if (!(await page.getByRole('heading', { name: 'Tracing recursive trees' }).isVisible())) throw new Error('Demo did not open with useful sample data');
  const untouched = await page.evaluate(() => localStorage.getItem('tutor-session-trace:v1'));
  if (untouched !== JSON.stringify(realStore)) throw new Error('Demo changed the real notebook namespace');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByRole('button', { name: 'Start for real' }).click();
  await page.waitForURL(`${base}/`);
  if (!(await page.getByRole('heading', { name: 'Real notebook sentinel' }).isVisible())) throw new Error('Leaving demo did not restore the real notebook');
  await context.close();
});

await run('free notebook enforces five local sessions', '@claim:five-free-sessions', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('tutor-session-trace:v1', JSON.stringify({ activeId: 's1', sessions: Array.from({ length: 5 }, (_, index) => ({ id: `s${index + 1}`, student: `Student ${index + 1}`, topic: `Topic ${index + 1}`, date: '2026-08-30', createdAt: '2026-08-30T10:00:00Z', summary: '', consent: false, moments: [], tasks: [] })) }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  const create = page.getByRole('button', { name: 'Open session page' });
  if (!(await create.isDisabled())) throw new Error('A sixth free session could be created');
  if (!(await page.getByText('Free notebooks hold five sessions.').isVisible())) throw new Error('Free limit is not explained');
  await context.close();
});

await run('sharing requires recorded consent', '@claim:consent-required', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByLabel('Student name').fill('Mina');
  await page.getByLabel('Session topic').fill('Consent boundary');
  await page.getByRole('button', { name: 'Open session page' }).click();
  if (await page.getByRole('button', { name: 'Create student link' }).count()) throw new Error('Share action was available before consent');
  if (!(await page.getByText('Record consent to create a student link.').isVisible())) throw new Error('Consent requirement was not explained');
  const rejected = await context.request.post(`${base}/api/shares`, {
    data: { student_name: 'Mina', session_title: 'Consent boundary', session_date: '2026-08-30', summary: '', moments: [], next_tasks: [], consent: false, expires_days: 7 },
  });
  if (rejected.status() !== 422) throw new Error(`Backend accepted sharing without consent: ${rejected.status()}`);
  await page.getByLabel(/Student consent recorded/).check();
  if (!(await page.getByRole('button', { name: 'Create student link' }).isVisible())) throw new Error('Share action did not appear after consent');
  await context.close();
});

await run('shared recaps count opens and can be deleted', '@regression:shared-recap-lifecycle', async () => {
  const context = await browser.newContext();
  const created = await context.request.post(`${base}/api/shares`, {
    data: {
      student_name: 'Mina', session_title: 'Lifecycle proof', session_date: '2026-08-30',
      summary: 'A short student-visible recap.', moments: [], next_tasks: [], consent: true, expires_days: 7,
    },
  });
  if (created.status() !== 201) throw new Error(`Could not create lifecycle fixture: ${created.status()} ${await created.text()}`);
  const share = await created.json();
  const expectedExpiry = Date.now() + 7 * 86_400_000;
  if (Math.abs(new Date(share.expires_at).getTime() - expectedExpiry) > 120_000) throw new Error(`Seven-day expiry differs: ${share.expires_at}`);
  const opened = await context.request.get(`${base}/api/shares/${share.id}`);
  if (opened.status() !== 200) throw new Error(`Shared recap did not open: ${opened.status()}`);
  const status = await context.request.get(`${base}/api/shares/${share.id}/status?key=${encodeURIComponent(share.delete_key)}`);
  const statusBody = await status.json();
  if (status.status() !== 200 || statusBody.opens !== 1) throw new Error(`Open count differs: ${status.status()} ${JSON.stringify(statusBody)}`);
  const deleted = await context.request.delete(`${base}/api/shares/${share.id}?key=${encodeURIComponent(share.delete_key)}`);
  if (deleted.status() !== 204) throw new Error(`Early deletion failed: ${deleted.status()}`);
  const gone = await context.request.get(`${base}/api/shares/${share.id}`);
  if (gone.status() !== 404) throw new Error(`Deleted recap remained available: ${gone.status()}`);
  await context.close();
});

await run('free use sends no data off origin', '@claim:privacy-no-tracking', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const offOrigin = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== new URL(base).origin) offOrigin.push(request.url());
  });
  await page.goto(`${base}/demo`, { waitUntil: 'networkidle' });
  await page.getByLabel('What did you observe?').fill('This remains inside the demo notebook.');
  await page.getByRole('button', { name: 'Record moment' }).click();
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await page.waitForLoadState('networkidle');
  if (offOrigin.length) throw new Error(`Free flow contacted another origin: ${JSON.stringify(offOrigin)}`);
  const resourceOrigins = await page.evaluate(() => [...new Set(performance.getEntriesByType('resource').map(entry => new URL(entry.name).origin))]);
  if (resourceOrigins.some(origin => origin !== new URL(base).origin)) throw new Error(`Page loaded an off-origin resource: ${JSON.stringify(resourceOrigins)}`);
  await context.close();
});

await run('a valid paid verdict enables the complete plan', '@claim:paid-plan', async () => {
  const context = await browser.newContext();
  await context.route('https://api.sociobot.in/api/v1/products/tutor-session-trace/verify?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ valid: true, reason: 'ok', expires_at: null }),
  }));
  await context.addInitScript(() => {
    const sessions = Array.from({ length: 5 }, (_, index) => ({
      id: `paid-${index + 1}`, student: `Student ${index + 1}`, topic: `Paid topic ${index + 1}`,
      date: '2026-08-30', createdAt: '2026-08-30T10:00:00Z', summary: '', consent: index === 0,
      moments: [], tasks: [],
    }));
    localStorage.setItem('tutor-session-trace:v1', JSON.stringify({ activeId: 'paid-1', sessions }));
  });
  const page = await context.newPage();
  await page.goto(`${base}/?license=recorded-valid-license`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Plan & settings' }).click();
  await page.getByRole('heading', { name: 'Full plan active' }).waitFor();
  if (await page.getByRole('button', { name: 'Open session page' }).isDisabled()) throw new Error('Valid paid plan did not allow a sixth local session');
  const expiryValues = await page.getByLabel('Link expiry').locator('option').evaluateAll(options => options.map(option => option.value));
  if (expiryValues.join(',') !== '1,7,14,30') throw new Error(`Paid expiry choices differ: ${expiryValues.join(',')}`);
  const storedLicense = await page.evaluate(() => ({
    token: localStorage.getItem('sb_license:tutor-session-trace'),
    search: location.search,
  }));
  if (storedLicense.token !== 'recorded-valid-license' || storedLicense.search.includes('license=')) throw new Error(`License return handling failed: ${JSON.stringify(storedLicense)}`);
  await context.close();
});

await run('mobile legal links have 44px targets', '@claim:mobile-touch-targets', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const name of ['Privacy', 'Terms']) {
    const box = await page.getByRole('contentinfo').getByRole('link', { name, exact: true }).boundingBox();
    if (!box || box.width < 44 || box.height < 44) throw new Error(`${name} target is below 44px: ${JSON.stringify(box)}`);
  }
  await context.close();
});

await run('routes keep a clear outline and show a designed missing-page response', '@regression:site-structure', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  const headingOrder = await page.locator('h1, h2, h3').evaluateAll(headings => headings.map(heading => heading.tagName));
  if (headingOrder[0] !== 'H1') throw new Error(`Heading outline starts below h1: ${headingOrder.join(', ')}`);
  if (await page.locator('a.skip-link').count() !== 1) throw new Error('The page rendered more than one skip link');
  for (const name of ['How it works', 'Privacy and limits', 'Full notebook plan']) {
    if (!(await page.getByRole('heading', { name, exact: true }).isVisible())) throw new Error(`Landing section is missing: ${name}`);
  }
  const footerText = await page.getByRole('contentinfo').innerText();
  if (!footerText.includes('Built by Param Factory') || !footerText.includes('v1.0.0')) throw new Error(`Footer build information is missing: ${footerText}`);

  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy', exact: true }).click();
  await page.waitForURL(`${base}/privacy`);
  await page.getByRole('heading', { name: 'Privacy, in plain language' }).waitFor();
  await page.waitForFunction(() => document.activeElement === document.querySelector('h1'));
  const announcement = await page.locator('#route-status').innerText();
  if (!announcement.includes('Privacy')) throw new Error(`Route change was not announced: ${announcement}`);

  const response = await page.goto(`${base}/missing-regression-route`, { waitUntil: 'networkidle' });
  if (response?.status() !== 404) throw new Error(`Missing route returned ${response?.status()}`);
  if (await page.title() !== 'Page not found — Tutor Session Trace') throw new Error(`Missing route title differs: ${await page.title()}`);
  if (!(await page.getByRole('heading', { name: 'This page could not be found' }).isVisible())) throw new Error('Missing route has no useful h1');
  if (await page.locator('main').count() !== 1) throw new Error('Missing route has no main landmark');
  if (!(await page.getByRole('link', { name: 'Open your notebook' }).isVisible())) throw new Error('Missing route has no way back');
  const axe = await new AxeBuilder({ page }).analyze();
  const serious = axe.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  if (serious.length) throw new Error(`Missing page accessibility violations: ${JSON.stringify(serious)}`);
  await context.close();
});

await run('checkout link uses the registered Sociobot product', '@claim:paid-checkout', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Plan & settings' }).click();
  const href = await page.getByRole('link', { name: 'Buy the full notebook' }).getAttribute('href');
  const expected = 'https://api.sociobot.in/api/v1/products/tutor-session-trace/checkout';
  if (href !== expected) throw new Error(`Checkout href differs: ${href}`);
  const displayedPrice = (await page.locator('.price').innerText()).replace(/\s+/g, ' ').trim();
  if (displayedPrice !== '$19 one time') throw new Error(`Displayed one-time price differs: ${displayedPrice}`);
  if (process.env.CHECK_LIVE_CHECKOUT === '1') {
    const response = await context.request.get(expected, { maxRedirects: 0 });
    if (![301, 302, 303, 307, 308].includes(response.status())) {
      throw new Error(`Live checkout did not redirect: ${response.status()} ${await response.text()}`);
    }
    const location = response.headers().location || '';
    if (!location.startsWith('https://checkout.dodopayments.com/')) throw new Error(`Unexpected checkout destination: ${location}`);
  }
  await context.close();
});

await browser.close();
