import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const hostDirectory = resolve(import.meta.dirname, '..');
const buildDirectory = resolve(hostDirectory, 'component-build');
const componentDirectory = resolve(hostDirectory, 'component');
const metadata = JSON.parse(await readFile(resolve(componentDirectory, 'COMPONENT.json'), 'utf8'));
const buildManifest = JSON.parse(await readFile(
  resolve(componentDirectory, metadata.buildManifest.artifact),
  'utf8',
));

verifyTool('rustc', ['--version'], metadata.toolchain.rust);
verifyTool('cargo', ['--version'], metadata.toolchain.cargo);
verifyTool('wasm-tools', ['--version'], metadata.toolchain.wasmTools);

await verifyInput('Cargo.toml', buildManifest.wrapper.manifestSha256);
await verifyInput('Cargo.lock', buildManifest.wrapper.cargoLockSha256);
await verifyInput('src/lib.rs', buildManifest.wrapper.sourceSha256);
await verifyInput('wit/world.wit', buildManifest.wrapper.witSha256);
await verifyLockedCrate();

run('cargo', ['build', '--locked', '--target', 'wasm32-unknown-unknown', '--release'], buildDirectory);

const targetDirectory = resolve(buildDirectory, 'target/wasm32-unknown-unknown/release');
const modulePath = resolve(targetDirectory, 'adaptive_admission_component.wasm');
const builtComponentPath = resolve(targetDirectory, 'adaptive_admission_component.component.wasm');
run('wasm-tools', ['component', 'new', modulePath, '-o', builtComponentPath], buildDirectory);
run('wasm-tools', ['validate', builtComponentPath], buildDirectory);
run('wasm-tools', [
  'component',
  'targets',
  resolve(buildDirectory, 'wit/world.wit'),
  builtComponentPath,
  '--world',
  `${metadata.component.package.split('@')[0]}/${metadata.component.world}@${metadata.component.version}`,
], buildDirectory);

const builtBytes = await readFile(builtComponentPath);
const builtDigest = digest(builtBytes);
const committedBytes = await readFile(resolve(componentDirectory, metadata.component.artifact));
const committedDigest = digest(committedBytes);
if (committedDigest !== metadata.component.sha256) {
  throw new Error(`committed component checksum mismatch: expected ${metadata.component.sha256}, received ${committedDigest}`);
}

const normalizedBuiltPath = resolve(targetDirectory, 'adaptive_admission_component.normalized.wasm');
const normalizedCommittedPath = resolve(targetDirectory, 'adaptive_admission_component.committed.normalized.wasm');
run('wasm-tools', ['strip', builtComponentPath, '-o', normalizedBuiltPath], buildDirectory);
run('wasm-tools', [
  'strip',
  resolve(componentDirectory, metadata.component.artifact),
  '-o',
  normalizedCommittedPath,
], buildDirectory);
const normalizedBuiltBytes = await readFile(normalizedBuiltPath);
const normalizedCommittedBytes = await readFile(normalizedCommittedPath);
if (!normalizedBuiltBytes.equals(normalizedCommittedBytes)) {
  throw new Error('rebuilt component differs from the committed npm artifact after metadata normalization');
}

console.log(
  `Verified reproducible component ${metadata.source.crate}@${metadata.source.version} `
  + `(artifact ${committedDigest}, rebuild ${builtDigest})`,
);

async function verifyInput(relativePath, expectedDigest) {
  const receivedDigest = digest(await readFile(resolve(buildDirectory, relativePath)));
  if (receivedDigest !== expectedDigest) {
    throw new Error(`${relativePath} checksum mismatch: expected ${expectedDigest}, received ${receivedDigest}`);
  }
}

async function verifyLockedCrate() {
  const lockfile = await readFile(resolve(buildDirectory, 'Cargo.lock'), 'utf8');
  const escapedName = escapeRegExp(metadata.source.crate);
  const escapedVersion = escapeRegExp(metadata.source.version);
  const packagePattern = new RegExp(
    `\\[\\[package\\]\\]\\s+name = "${escapedName}"\\s+version = "${escapedVersion}"\\s+source = "registry\\+https://github\\.com/rust-lang/crates\\.io-index"\\s+checksum = "${metadata.source.checksum}"`,
  );
  if (!packagePattern.test(lockfile)) {
    throw new Error('Cargo.lock does not pin the declared crates.io package and checksum');
  }
}

function verifyTool(command, args, expectedOutput) {
  const output = run(command, args, buildDirectory, true).trim();
  if (output !== expectedOutput) {
    throw new Error(`${command} version mismatch: expected ${expectedOutput}, received ${output}`);
  }
}

function run(command, args, cwd, capture = false) {
  const executable = process.platform === 'win32' ? `${command}.exe` : command;
  const result = spawnSync(executable, args, {
    cwd,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
  return result.stdout ?? '';
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
