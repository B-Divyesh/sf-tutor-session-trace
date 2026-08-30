import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const target = process.argv[2];
if (!target) throw new Error('A test module path is required.');

const base = (process.env.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const localDefault = !process.env.BASE_URL && base === 'http://127.0.0.1:8080';
let server;
let databaseDirectory;

async function healthy() {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1_000) });
    const body = await response.json();
    return response.ok && body.status === 'ok';
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? accept() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
  await Promise.race([
    new Promise(resolveExit => server.once('exit', resolveExit)),
    new Promise(resolveTimeout => setTimeout(resolveTimeout, 5_000)),
  ]);
}

if (!(await healthy())) {
  if (!localDefault) throw new Error(`The configured BASE_URL is unavailable: ${base}`);

  await run('npm', ['run', 'build']);
  databaseDirectory = await mkdtemp(`${tmpdir()}/tutor-session-trace-tests-`);
  server = spawn('cargo', ['run', '--quiet'], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PORT: '8080',
      FRONTEND_DIR: resolve('dist'),
      DATABASE_URL: `sqlite://${databaseDirectory}/trace.db`,
      BUILD_SHA: '0000000000000000000000000000000000000000',
    },
  });
  server.once('error', error => {
    throw error;
  });

  const deadline = Date.now() + 180_000;
  while (!(await healthy())) {
    if (server.exitCode !== null) throw new Error(`The test server exited with ${server.exitCode}.`);
    if (Date.now() >= deadline) throw new Error('The test server did not become healthy within 180 seconds.');
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
}

process.env.BASE_URL = base;
try {
  await import(pathToFileURL(resolve(target)).href);
} finally {
  await stopServer();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
}
