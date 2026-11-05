import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transpile, writeFiles } from '@bytecodealliance/jco-transpile';

import { defaultMetadataPath, loadComponentBundle } from './component-metadata.mjs';

const metadataPath = process.env.ADAPTIVE_ADMISSION_COMPONENT_METADATA ?? defaultMetadataPath;
const { artifacts } = await loadComponentBundle(metadataPath);
const componentPath = artifacts.component.path;
const outputPath = fileURLToPath(new URL('../src/generated', import.meta.url));

await rm(outputPath, { recursive: true, force: true });

const result = await transpile(componentPath, {
  name: 'adaptive-admission',
  namespacedExports: false,
  instantiation: 'sync',
  emitTypescriptDeclarations: true,
});
await writeFiles(result.files, { baseDir: outputPath });
