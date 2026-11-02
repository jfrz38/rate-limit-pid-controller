import {
  assertPackagePolicy,
  defaultMetadataPath,
  loadComponentBundle,
} from './component-metadata.mjs';

const operation = process.argv[2];
if (operation !== 'pack' && operation !== 'publish') {
  throw new Error('package policy operation must be pack or publish');
}

const metadataPath = process.env.ADAPTIVE_ADMISSION_COMPONENT_METADATA
  ? process.env.ADAPTIVE_ADMISSION_COMPONENT_METADATA
  : defaultMetadataPath;
const { metadata } = await loadComponentBundle(metadataPath);
assertPackagePolicy(metadata, operation);
