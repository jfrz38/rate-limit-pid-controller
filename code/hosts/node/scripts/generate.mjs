import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transpile, writeFiles } from '@bytecodealliance/jco-transpile';

const metadataPath = fileURLToPath(new URL('../component/development/COMPONENT.json', import.meta.url));
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
if (metadata.developmentSnapshot !== true || !/^[0-9a-f]{40}$/.test(metadata.sourceCommit)) {
  throw new Error('development component metadata must identify an exact source commit');
}
const componentPath = fileURLToPath(new URL(`../component/development/${metadata.artifact}`, import.meta.url));
const outputPath = fileURLToPath(new URL('../src/generated', import.meta.url));

const component = await readFile(componentPath);
const actualDigest = createHash('sha256').update(component).digest('hex');
if (actualDigest !== metadata.sha256) {
  throw new Error(`component checksum mismatch: expected ${metadata.sha256}, received ${actualDigest}`);
}

await rm(outputPath, { recursive: true, force: true });

const result = await transpile(componentPath, {
  name: 'adaptive-admission',
  namespacedExports: false,
  instantiation: 'sync',
  emitTypescriptDeclarations: true,
});
await writeFiles(result.files, { baseDir: outputPath });
