import { readFile } from 'node:fs/promises';

const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
const buildScript = await readFile(new URL('../build.rs', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const firstInstruction = dockerfile
  .split('\n')
  .map(line => line.trim())
  .find(line => line && !line.startsWith('#'));
assert(firstInstruction === 'ARG BUILD_SHA=dev', 'BUILD_SHA=dev must be declared before the first stage');
assert(
  (dockerfile.match(/^ARG BUILD_SHA$/gm) || []).length >= 2,
  'backend and runtime stages must both consume BUILD_SHA'
);
assert(
  dockerfile.includes('BUILD_SHA="${BUILD_SHA:-dev}" cargo build --locked --release'),
  'the backend build must normalize an explicitly empty BUILD_SHA to dev'
);
assert(
  dockerfile.includes('org.opencontainers.image.revision="$BUILD_SHA"'),
  'the runtime image must expose the supplied revision as OCI metadata'
);
assert(!/(?:COPY|ADD)\s+.*\.git|\bgit\b/i.test(dockerfile), 'the container build must not read .git');
assert(!/Command::new\("git"\)|rev-parse|\.git/.test(buildScript), 'build.rs must not depend on Git metadata');
assert(buildScript.includes('"dev".to_owned()'), 'build.rs must have a source-archive-safe dev identity');

console.log('container build identity contract passed');
