import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { componentWit } from '@bytecodealliance/jco-transpile/wasm-tools';

export const defaultMetadataPath = new URL('../component/COMPONENT.json', import.meta.url);

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
    ['component', 'wit', 'conformance', 'upstreamRelease', 'buildManifest'].map(async (name) => {
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
  validateUpstreamManifest(metadata, artifacts.upstreamRelease.bytes);
  validateBuildManifest(metadata, artifacts.buildManifest.bytes);

  return { metadata, artifacts };
}

export function assertPackagePolicy(metadata, operation) {
  if (metadata.publishable === true) {
    return;
  }
  throw new Error(
    `${operation} is forbidden for ${metadata.source.type} components; `
      + 'only stable component metadata may be published',
  );
}

function validateMetadata(metadata) {
  assert(metadata?.schemaVersion === 1, 'component metadata schemaVersion must be 1');
  assert(metadata?.source?.type === 'crates-io', 'component source type must be crates-io');
  assert(metadata.source.registry === 'https://crates.io', 'component registry must be crates.io');
  assert(metadata.source.crate === 'adaptive-admission-core', 'unexpected Rust crate');
  assert(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(metadata.source.version), 'crate version must be exact SemVer');
  assert(/^[0-9a-f]{64}$/.test(metadata.source.checksum), 'crate checksum is invalid');
  assert(metadata.source.owner === 'jfrz38', 'unexpected crates.io owner');
  assert(metadata.source.repository === 'https://github.com/jfrz38/adaptive-admission-controller', 'unexpected source repository');
  assert(/^[0-9a-f]{40}$/.test(metadata.source.commit), 'crate source must identify an exact upstream commit');
  assert(metadata.publishable === true, 'stable crates.io components must be publishable');
  assert(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(metadata.component?.version), 'component version must be SemVer');
  assert(metadata.component.version === metadata.source.version, 'crate and component versions must match');
  assert(metadata.component.package === `jfrz38:adaptive-admission@${metadata.component.version}`, 'component package/version mismatch');
  assert(metadata.component.world === 'adaptive-admission', 'unexpected component world');
  for (const name of ['component', 'wit', 'conformance', 'upstreamRelease', 'buildManifest']) {
    const descriptor = metadata[name];
    assert(typeof descriptor?.artifact === 'string' && descriptor.artifact.length > 0, `${name} artifact is required`);
    assert(/^[0-9a-f]{64}$/.test(descriptor.sha256), `${name} SHA-256 is invalid`);
  }
  assert(typeof metadata.toolchain?.rust === 'string', 'Rust toolchain is required');
  assert(typeof metadata.toolchain?.cargo === 'string', 'Cargo toolchain is required');
  assert(typeof metadata.toolchain?.wasmTools === 'string', 'wasm-tools version is required');
  assert(typeof metadata.toolchain?.witBindgen === 'string', 'wit-bindgen version is required');
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
  assert(manifest.source?.commit === metadata.source.commit, 'upstream manifest commit does not match stable metadata');
  assert(manifest.source?.treeDirty === false, 'upstream manifest was produced from a dirty tree');
  assert(manifest.rustCrate?.name === metadata.source.crate, 'upstream crate name does not match');
  assert(manifest.rustCrate?.version === metadata.source.version, 'upstream crate version does not match');
  assert(manifest.wit?.sha256 === metadata.wit.sha256, 'upstream WIT checksum does not match');
  assert(manifest.conformance?.sha256 === metadata.conformance.sha256, 'upstream conformance checksum does not match');
}

function validateBuildManifest(metadata, bytes) {
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  assert(manifest.schemaVersion === 1, 'build manifest schema is unsupported');
  assert(manifest.source?.registry === metadata.source.registry, 'build registry does not match');
  assert(manifest.source?.crate === metadata.source.crate, 'build crate name does not match');
  assert(manifest.source?.version === metadata.source.version, 'build crate version does not match');
  assert(manifest.source?.checksum === metadata.source.checksum, 'build crate checksum does not match');
  assert(manifest.source?.owner === metadata.source.owner, 'build crate owner does not match');
  assert(manifest.source?.repository === metadata.source.repository, 'build repository does not match');
  assert(manifest.source?.commit === metadata.source.commit, 'build upstream commit does not match');
  assert(manifest.wrapper?.upstreamCommit === metadata.source.commit, 'wrapper commit does not match');
  for (const name of ['manifestSha256', 'cargoLockSha256', 'sourceSha256', 'witSha256']) {
    assert(/^[0-9a-f]{64}$/.test(manifest.wrapper?.[name]), `build wrapper ${name} is invalid`);
  }
  assert(manifest.wrapper.witSha256 === metadata.wit.sha256, 'build WIT checksum does not match');
  assert(manifest.component?.package === metadata.component.package, 'build component package does not match');
  assert(manifest.component?.world === metadata.component.world, 'build component world does not match');
  assert(manifest.component?.artifact === metadata.component.artifact, 'build component artifact does not match');
  assert(manifest.component?.sha256 === metadata.component.sha256, 'build component checksum does not match');
  assert(manifest.toolchain?.rust === metadata.toolchain.rust, 'build Rust toolchain does not match');
  assert(manifest.toolchain?.cargo === metadata.toolchain.cargo, 'build Cargo toolchain does not match');
  assert(manifest.toolchain?.wasmTools === metadata.toolchain.wasmTools, 'build wasm-tools version does not match');
  assert(manifest.toolchain?.witBindgen === metadata.toolchain.witBindgen, 'build wit-bindgen version does not match');
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
