import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transpile, writeFiles } from '@bytecodealliance/jco-transpile';

const componentPath = fileURLToPath(new URL('../component/adaptive-admission-component-v0.1.0.wasm', import.meta.url));
const outputPath = fileURLToPath(new URL('../src/generated', import.meta.url));
const expectedDigest = '1ef71e6ae21d35245921049dbb51bc0abebf573d2682f887855eeec6c70a6df8';

const component = await readFile(componentPath);
const actualDigest = createHash('sha256').update(component).digest('hex');
if (actualDigest !== expectedDigest) {
  throw new Error(`component checksum mismatch: expected ${expectedDigest}, received ${actualDigest}`);
}

await rm(outputPath, { recursive: true, force: true });

const result = await transpile(componentPath, {
  name: 'adaptive-admission',
  namespacedExports: false,
  instantiation: 'sync',
  emitTypescriptDeclarations: true,
});
await writeFiles(result.files, { baseDir: outputPath });
