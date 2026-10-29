import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createStepImporter,
} from '../../packages/step-importer/src/index.js';

test('exposes STEP AP242 extensions and declared capabilities', () => {
  const importer = createStepImporter();

  expect(importer.id).toBe('step');
  expect(importer.extensions).toEqual(['.step', '.stp']);
  expect(importer.capabilities).toEqual({
    hierarchy: true,
    vertexColors: false,
    materialColors: true,
    instances: false,
    semanticMetadata: false,
  });
});
