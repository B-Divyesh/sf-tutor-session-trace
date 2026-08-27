import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
const workerChrome = '/opt/pw-browsers/chromium-1208/chrome-linux64/chrome';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(workerChrome) ? workerChrome : undefined);
const browser = await chromium.launch({ executablePath });
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktop = await desktopContext.newPage();
const desktopErrors = [];
desktop.on('pageerror', error => desktopErrors.push(String(error)));
desktop.on('console', message => { if (message.type() === 'error') desktopErrors.push(`${message.text()} @ ${message.location().url}`); });
await desktop.goto(base, { waitUntil: 'networkidle' });
if (await desktop.locator('h1').count() !== 1) throw new Error('Desktop landing page must have exactly one h1');
const desktopOverflow = await desktop.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (desktopOverflow) throw new Error('Desktop landing page has horizontal overflow');
if (desktopErrors.length) throw new Error(`Desktop console errors: ${desktopErrors.join('\n')}`);
await desktopContext.close();

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', error => consoleErrors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`${message.text()} @ ${message.location().url}`); });

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.getByLabel('Student name').fill('Mina');
await page.getByLabel('Session topic').fill('Recursive trees');
await page.getByRole('button', { name: 'Open session page' }).click();
await page.getByLabel('What did you observe?').fill('Kept a private note about pacing.');
await page.getByLabel('Tutor-only note', { exact: true }).check();
await page.getByLabel('What did you observe?').press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

await page.getByLabel('What did you observe?').fill('Traced the left branch and named the base case.');
await page.getByLabel('Moment type').selectOption('breakthrough');
await page.getByLabel('Outcome').selectOption('solved');
await page.getByLabel('Attach').selectOption('code');
await page.getByLabel('Link or code snippet').fill('if (node == null) return 0;');
await page.getByRole('button', { name: 'Record moment' }).click();
const removeTarget = await page.getByRole('button', { name: 'Remove' }).first().boundingBox();
if (!removeTarget || removeTarget.width < 44 || removeTarget.height < 44) {
  throw new Error(`Moment removal target must be at least 44px; got ${JSON.stringify(removeTarget)}`);
}
await page.getByLabel('Student-visible session summary').fill('Name the base case before following recursive branches.');
await page.getByLabel('Student-visible session summary').blur();
await page.getByLabel('New practice task').fill('Trace a tree of depth three on paper');
await page.getByRole('button', { name: 'Add practice task' }).click();
await page.getByLabel(/Student consent recorded/).check();

const workspaceAxe = await new AxeBuilder({ page }).analyze();
if (workspaceAxe.violations.some(violation => ['serious', 'critical'].includes(violation.impact))) {
  throw new Error(`Workspace accessibility violations: ${JSON.stringify(workspaceAxe.violations, null, 2)}`);
}

await page.getByRole('button', { name: 'Create student link' }).click();
const shareUrl = await page.getByLabel(/Student link/).inputValue();
const student = await context.newPage();
await student.goto(shareUrl, { waitUntil: 'networkidle' });
if (await student.getByText('Kept a private note about pacing.').count()) throw new Error('Tutor-only note leaked into student recap');
if (!(await student.getByText('Trace a tree of depth three on paper').count())) throw new Error('Next practice missing from student recap');
if (await student.locator('h1').count() !== 1) throw new Error('Student recap must have exactly one h1');
const recapAxe = await new AxeBuilder({ page: student }).analyze();
if (recapAxe.violations.some(violation => ['serious', 'critical'].includes(violation.impact))) {
  throw new Error(`Recap accessibility violations: ${JSON.stringify(recapAxe.violations, null, 2)}`);
}

if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join('\n')}`);
console.log(JSON.stringify({
  session: 'created',
  keyboardCapture: 'passed',
  desktop: 'passed',
  consentShare: 'passed',
  privateNoteExcluded: 'passed',
  nextPracticeVisible: 'passed',
  seriousCriticalAxeViolations: workspaceAxe.violations.concat(recapAxe.violations).filter(v => ['serious', 'critical'].includes(v.impact)).length,
  consoleErrors: consoleErrors.length
}, null, 2));

await browser.close();
