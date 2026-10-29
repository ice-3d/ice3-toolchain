import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { expect } from '#test-expect';

test('fixtures contain ASCII and binary USD', async () => {
  const ascii = await readFile(
    'tests/fixtures/usd/synthetic-plant.usda',
    'utf8',
  );
  const binary = await readFile(
    'tests/fixtures/usd/synthetic-plant.usdc',
  );

  expect(ascii).toContain('#usda 1.0');
  expect(ascii).toContain('PrimaryPump');
  expect(binary.subarray(0, 8).toString('ascii')).toBe('PXR-USDC');
});

test('fixtures include georeferenced and failure cases', async () => {
  const largeOrigin = await readFile(
    'tests/fixtures/usd/large-origin.usda',
    'utf8',
  );
  const empty = await readFile('tests/fixtures/usd/empty.usda', 'utf8');
  const truncated = await readFile(
    'tests/fixtures/usd/truncated.usda',
    'utf8',
  );

  expect(largeOrigin).toContain('1000010');
  expect(empty).not.toContain('def Mesh');
  expect(truncated.endsWith(')')).toBe(false);
});
