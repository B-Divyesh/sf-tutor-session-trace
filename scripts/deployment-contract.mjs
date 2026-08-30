import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../deploy/containerapp.json', import.meta.url), 'utf8'));
const deployScript = await readFile(new URL('./deploy-container.sh', import.meta.url), 'utf8');
const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const template = manifest.properties?.template;
const container = template?.containers?.find(candidate => candidate.name === 'app');
const volume = template?.volumes?.find(candidate => candidate.name === 'data');
const mount = container?.volumeMounts?.find(candidate => candidate.volumeName === 'data');

assert(manifest.properties?.configuration?.activeRevisionsMode === 'Single', 'only one revision may receive traffic');
assert(template?.scale?.minReplicas === 1, 'the recap service must always have one replica');
assert(template?.scale?.maxReplicas === 1, 'the process-local limiter requires exactly one replica');
assert(volume?.storageType === 'AzureFile', 'recap data must use durable Azure Files storage');
assert(volume?.storageName === 'data-tutor-session-trace', 'the product-specific storage binding is required');
assert(mount?.mountPath === '/data', 'durable recap data must be mounted at /data');
assert(dockerfile.includes('DATABASE_URL=sqlite:///data/trace.db'), 'SQLite must store recaps inside the durable mount');
assert(deployScript.includes('--build-arg "BUILD_SHA=$source_sha"'), 'deployment must compile the exact source identity');
assert(deployScript.includes('.build == $sha'), 'deployment must reject a mismatched live health identity');
assert(deployScript.includes("length == 1 and .[0].properties.trafficWeight == 100"), 'deployment must reject split revision traffic');

console.log('single-replica durable deployment contract passed');
