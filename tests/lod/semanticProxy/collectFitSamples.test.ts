import { expect, test } from 'node-test';
import { collectFitSamples } from '../../../packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.js';

test('collects unique vertices, triangle centroids, areas, and bounds', () => {
  const samples = collectFitSamples([{
    positions: new Float32Array([
      0, 0, 0,
      2, 0, 0,
      0, 2, 0,
      2, 2, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
  }]);

  expect(samples.vertices.length / 3).toBe(4);
  expect(samples.centroids.length / 3).toBe(2);
  expect(samples.areas).toHaveLength(2);
  expect([...samples.areas]).toEqual([2, 2]);
  expect(samples.bounds).toEqual({
    min: [0, 0, 0],
    max: [2, 2, 0],
  });
});

test('deduplicates coincident vertices and centroids deterministically', () => {
  const geometry = {
    positions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]),
    indices: new Uint32Array([0, 1, 2]),
  };
  const first = collectFitSamples([geometry, geometry]);
  const second = collectFitSamples([geometry, geometry]);

  expect(first.vertices.length / 3).toBe(3);
  expect(first.centroids.length / 3).toBe(1);
  expect([...first.vertices]).toEqual([...second.vertices]);
  expect([...first.centroids]).toEqual([...second.centroids]);
});
