import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

// @ts-expect-error The metadata validator is an ESM build script, not package source.
import { assertPackagePolicy, loadComponentBundle } from '../scripts/component-metadata.mjs';

const componentDirectory = new URL('../component/', import.meta.url);
const metadataUrl = new URL('COMPONENT.json', componentDirectory);

describe('component metadata', () => {
  test('validates the pinned main snapshot and its embedded contract', async () => {
    const bundle = await loadComponentBundle(metadataUrl);

    expect(bundle.metadata).toMatchObject({
      source: {
        type: 'git-snapshot',
        branch: 'main',
        commit: 'b821533645e6dfbfb611b9459345d0e5030bf83a',
      },
      publishable: false,
    });
  });

  test('rejects an artifact whose checksum differs from metadata', async () => {
    await withComponentFixture(async (directory, metadata) => {
      metadata.component.sha256 = '0'.repeat(64);
      const fixtureMetadata = join(directory, 'COMPONENT.json');
      await writeFile(fixtureMetadata, JSON.stringify(metadata));

      await expect(loadComponentBundle(fixtureMetadata)).rejects.toThrow('component checksum mismatch');
    });
  });

  test('rejects a WIT contract missing a required operation', async () => {
    await withComponentFixture(async (directory, metadata) => {
      const witPath = join(directory, metadata.wit.artifact);
      const wit = (await readFile(witPath, 'utf8')).replace('        cancel: func(', '        removed-operation: func(');
      await writeFile(witPath, wit);
      metadata.wit.sha256 = createHash('sha256').update(wit).digest('hex');
      const fixtureMetadata = join(directory, 'COMPONENT.json');
      await writeFile(fixtureMetadata, JSON.stringify(metadata));

      await expect(loadComponentBundle(fixtureMetadata)).rejects.toThrow('cancel: func(');
    });
  });

  test('blocks snapshot pack and publish unless the smoke override is explicit', async () => {
    const { metadata } = await loadComponentBundle(metadataUrl);

    expect(() => assertPackagePolicy(metadata, 'pack', {})).toThrow('pack is forbidden');
    expect(() => assertPackagePolicy(metadata, 'publish', {
      ADAPTIVE_ADMISSION_SNAPSHOT_PACK: 'package-smoke',
    })).toThrow('publish is forbidden');
    expect(() => assertPackagePolicy(metadata, 'pack', {
      ADAPTIVE_ADMISSION_SNAPSHOT_PACK: 'package-smoke',
    })).not.toThrow();
  });
});

async function withComponentFixture(
  operation: (directory: string, metadata: Record<string, any>) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-admission-metadata-'));
  try {
    const metadata = JSON.parse(await readFile(metadataUrl, 'utf8'));
    await Promise.all([
      metadata.component.artifact,
      metadata.wit.artifact,
      metadata.conformance.artifact,
      metadata.upstreamManifest.artifact,
    ].map((artifact: string) => cp(new URL(artifact, componentDirectory), join(directory, artifact))));
    await operation(directory, metadata);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
