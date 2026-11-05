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
  test('validates the pinned crates.io component and its embedded contract', async () => {
    const bundle = await loadComponentBundle(metadataUrl);

    expect(bundle.metadata).toMatchObject({
      source: {
        type: 'crates-io',
        crate: 'adaptive-admission-core',
        version: '0.1.0',
        checksum: '823b1ca077228a3fd229aad05e958e585663072571f0f7709bdbfb70f28dab90',
        commit: 'b821533645e6dfbfb611b9459345d0e5030bf83a',
      },
      publishable: true,
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

  test('allows stable component pack and publication', async () => {
    const { metadata } = await loadComponentBundle(metadataUrl);

    expect(() => assertPackagePolicy(metadata, 'pack')).not.toThrow();
    expect(() => assertPackagePolicy(metadata, 'publish')).not.toThrow();
  });

  test('continues to reject non-publishable component metadata', () => {
    expect(() => assertPackagePolicy({
      source: { type: 'git-snapshot' },
      publishable: false,
    }, 'publish')).toThrow('publish is forbidden');
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
      metadata.upstreamRelease.artifact,
      metadata.buildManifest.artifact,
    ].map((artifact: string) => cp(new URL(artifact, componentDirectory), join(directory, artifact))));
    await operation(directory, metadata);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
