import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const base = (process.env.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const workerChrome = '/opt/pw-browsers/chromium-1208/chrome-linux64/chrome';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(workerChrome) ? workerChrome : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const offOrigin = new Set();
const browserErrors = [];

page.on('request', request => {
  if (new URL(request.url()).origin !== new URL(base).origin) offOrigin.add(request.url());
});
page.on('pageerror', error => browserErrors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(message.text());
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.keyboard.press('Tab');
const focus = await page.evaluate(() => {
  const element = document.activeElement;
  const style = element ? getComputedStyle(element) : null;
  return { tag: element?.tagName, outlineStyle: style?.outlineStyle, outlineWidth: style?.outlineWidth };
});
if (!focus.tag || focus.outlineStyle === 'none' || focus.outlineWidth === '0px') {
  throw new Error(`Keyboard focus is not visibly styled: ${JSON.stringify(focus)}`);
}

await page.getByLabel('Student name').fill('Privacy check');
await page.getByLabel('Session topic').fill('Local-only session');
await page.getByRole('button', { name: 'Open session page' }).click();
if (await page.getByLabel(/Student consent recorded/).isChecked()) {
  throw new Error('Student consent must default to unchecked');
}

await page.emulateMedia({ reducedMotion: 'reduce' });
const reducedMotion = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
if (reducedMotion !== 'auto') throw new Error(`Reduced motion should disable smooth scrolling, got ${reducedMotion}`);

const registration = await page.evaluate(async () => {
  const original = await navigator.serviceWorker.ready;
  const originalUrl = original.active?.scriptURL;
  const updated = await navigator.serviceWorker.register('/sw.js?identity-regression=1', { scope: '/' });
  await new Promise((resolve, reject) => {
    const worker = updated.installing || updated.waiting || updated.active;
    if (!worker || worker.state === 'activated') return resolve();
    const timeout = setTimeout(() => reject(new Error('service-worker update timed out')), 15000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  return { originalUrl, activeUrl: updated.active?.scriptURL };
});
if (!registration.activeUrl?.includes('identity-regression=1')) {
  throw new Error(`Service-worker update did not activate: ${JSON.stringify(registration)}`);
}

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
if (await page.locator('main').count() !== 1) throw new Error('Offline shell did not restore the main landmark');
await context.setOffline(false);

for (const path of ['/privacy', '/terms']) {
  const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  if (response?.status() !== 200) throw new Error(`${path} returned ${response?.status()}`);
  if (await page.locator('main').count() !== 1) throw new Error(`${path} is missing its main landmark`);
}

if (offOrigin.size) throw new Error(`Free experience made off-origin requests: ${[...offOrigin].join(', ')}`);
if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join('\n')}`);

console.log(JSON.stringify({
  base,
  mobileViewport: '390x844',
  keyboardFocus: focus,
  reducedMotion,
  serviceWorkerUpdate: registration,
  offlineReload: 'passed',
  legalPages: 'passed',
  consentDefault: 'unchecked',
  offOriginRequests: offOrigin.size,
  browserErrors: browserErrors.length
}, null, 2));

await browser.close();
