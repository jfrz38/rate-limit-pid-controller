import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { componentWit } from '@bytecodealliance/jco-transpile/wasm-tools';

export const defaultMetadataPath = new URL('../component/COMPONENT.json', import.meta.url);
export const snapshotPackOverride = 'ADAPTIVE_ADMISSION_SNAPSHOT_PACK';
export const snapshotPackOverrideValue = 'package-smoke';

const requiredWitDeclarations = [
  'resource admission-controller',
  'submit: func(',
  'complete: func(',
  'cancel: func(',
  'advance-time: func(',
  'shutdown: func(',
  'next-deadline: func(',
  'latest-statistics: func(',
  'latest-diagnostics: func(',
  'priority-percentile: func(',
  'default-config: func(',
  'create: func(',
];

export async function loadComponentBundle(metadataLocation = defaultMetadataPath) {
  const metadataUrl = metadataLocation instanceof URL
    ? metadataLocation
    : pathToFileURL(resolve(metadataLocation));
  const metadata = JSON.parse(await readFile(metadataUrl, 'utf8'));
  validateMetadata(metadata);

  const directory = dirname(fileURLToPath(metadataUrl));
  const artifacts = Object.fromEntries(await Promise.all(
    ['component', 'wit', 'conformance', 'upstreamManifest'].map(async (name) => {
      const descriptor = metadata[name];
      const path = resolveArtifact(directory, descriptor.artifact);
      const bytes = await readFile(path);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== descriptor.sha256) {
        throw new Error(`${name} checksum mismatch: expected ${descriptor.sha256}, received ${digest}`);
      }
      return [name, { path, bytes }];
    }),
  ));

  await validateContract(metadata, artifacts.component.bytes, artifacts.wit.bytes);
  validateUpstreamManifest(metadata, artifacts.upstreamManifest.bytes);

  return { metadata, artifacts };
}

export function assertPackagePolicy(metadata, operation, environment = process.env) {
  if (metadata.publishable === true) {
    return;
  }
  if (operation === 'pack' && environment[snapshotPackOverride] === snapshotPackOverrideValue) {
    return;
  }
  throw new Error(
    `${operation} is forbidden for ${metadata.source.type} components; `
      + 'only stable component metadata may be published',
  );
}

function validateMetadata(metadata) {
  assert(metadata?.schemaVersion === 1, 'component metadata schemaVersion must be 1');
  assert(metadata?.source?.type === 'git-snapshot', 'component source type must be git-snapshot');
  assert(metadata.source.repository === 'https://github.com/jfrz38/adaptive-admission-controller', 'unexpected source repository');
  assert(metadata.source.branch === 'main', 'snapshot branch must be main');
  assert(/^[0-9a-f]{40}$/.test(metadata.source.commit), 'snapshot source must identify an exact commit');
  assert(metadata.publishable === false, 'git snapshots must not be publishable');
  assert(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(metadata.component?.version), 'component version must be SemVer');
  assert(metadata.component.package === `jfrz38:adaptive-admission@${metadata.component.version}`, 'component package/version mismatch');
  assert(metadata.component.world === 'adaptive-admission', 'unexpected component world');
  for (const name of ['component', 'wit', 'conformance', 'upstreamManifest']) {
    const descriptor = metadata[name];
    assert(typeof descriptor?.artifact === 'string' && descriptor.artifact.length > 0, `${name} artifact is required`);
    assert(/^[0-9a-f]{64}$/.test(descriptor.sha256), `${name} SHA-256 is invalid`);
  }
  assert(typeof metadata.toolchain?.rust === 'string', 'Rust toolchain is required');
  assert(typeof metadata.toolchain?.wasmTools === 'string', 'wasm-tools version is required');
  assert(typeof metadata.toolchain?.jcoTranspile === 'string', 'jco-transpile version is required');
}

async function validateContract(metadata, componentBytes, witBytes) {
  const wit = new TextDecoder().decode(witBytes);
  assert(wit.includes(`package ${metadata.component.package};`), 'WIT package/version does not match metadata');
  assert(wit.includes(`world ${metadata.component.world}`), 'WIT world does not match metadata');
  for (const declaration of requiredWitDeclarations) {
    assert(wit.includes(declaration), `WIT contract is missing required declaration: ${declaration}`);
  }

  const embeddedWit = await componentWit(componentBytes);
  const [packageName, version] = metadata.component.package.split('@');
  const expectedExport = `export ${packageName}/controller@${version};`;
  assert(embeddedWit.includes(expectedExport), `component does not export ${expectedExport}`);
}

function validateUpstreamManifest(metadata, bytes) {
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  assert(manifest.schemaVersion === 1, 'upstream manifest schema is unsupported');
  assert(manifest.source?.commit === metadata.source.commit, 'upstream manifest commit does not match snapshot metadata');
  assert(manifest.source?.treeDirty === false, 'upstream manifest was produced from a dirty tree');
  assert(manifest.component?.artifact === metadata.component.artifact, 'upstream component artifact does not match');
  assert(manifest.component?.sha256 === metadata.component.sha256, 'upstream component checksum does not match');
  assert(manifest.wit?.sha256 === metadata.wit.sha256, 'upstream WIT checksum does not match');
  assert(manifest.conformance?.sha256 === metadata.conformance.sha256, 'upstream conformance checksum does not match');
}

function resolveArtifact(directory, artifact) {
  if (basename(artifact) !== artifact) {
    throw new Error(`component artifact must be a file name: ${artifact}`);
  }
  return resolve(directory, artifact);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
