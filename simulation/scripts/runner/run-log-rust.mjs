import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerDirectory = path.dirname(fileURLToPath(import.meta.url));
const scenarioName = process.argv.slice(2).find((argument) => argument !== '--') || 'base';
const timestamp = new Date().toISOString().replace(/:/g, '-');
const logFolder = path.join(runnerDirectory, 'results', 'logs');
const outPath = path.join(logFolder, `${timestamp}-rust.log`);
const temporaryPath = `${outPath}.tmp`;

if (!fs.existsSync(logFolder)) fs.mkdirSync(logFolder, { recursive: true });

console.log(`Loading Rust/Wasm scenario: ${scenarioName}`);

const output = fs.openSync(temporaryPath, 'w');
const tsNodeEsm = path.join(runnerDirectory, 'node_modules', 'ts-node', 'dist', 'bin-esm.js');
const result = spawnSync(process.execPath, [
  tsNodeEsm,
  path.join(runnerDirectory, 'index-rust.mts'),
  scenarioName,
], {
  cwd: runnerDirectory,
  stdio: ['ignore', output, 'inherit'],
});
fs.closeSync(output);
if (result.error || result.status !== 0) {
  fs.rmSync(temporaryPath, { force: true });
  if (result.error) throw result.error;
  throw new Error(`Rust/Wasm simulation exited with status ${result.status}`);
}
fs.renameSync(temporaryPath, outPath);

console.log('Generated Rust/Wasm log: ', outPath);
