import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const scenarioName = args[0] || "base";
const scenarioFile = scenarioName.endsWith('.csv') ? scenarioName : `${scenarioName}.csv`;

const now = new Date();
const timestamp = now.toISOString().replace(/:/g, "-");
const logFolder = path.join(__dirname, "results", "logs");
const outPath = path.join(logFolder, `${timestamp}.log`);

if (!fs.existsSync(logFolder)) fs.mkdirSync(logFolder, { recursive: true });

console.log(`Loading scenario: ${scenarioName}`);

const scriptPath = path.join(__dirname, "index.ts");
const output = fs.openSync(outPath, 'w');
const result = spawnSync(process.execPath, [
  '--require',
  'ts-node/register/transpile-only',
  scriptPath,
  scenarioFile,
], {
  stdio: ['ignore', output, 'inherit'],
});
fs.closeSync(output);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Simulation exited with status ${result.status}`);

console.log("Generated log: ", outPath);
