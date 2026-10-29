import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  parseIfcValue,
} from '../../packages/ifc-importer/src/parseIfcValues.js';

test('keeps primitive arrays and omits recursive IFC values', () => {
  expect(parseIfcValue([1, 'open', true])).toEqual({
    value: [1, 'open', true],
    omitted: 0,
  });

  const recursive: Record<string, unknown> = {};
  recursive.value = recursive;
  const result = parseIfcValue(recursive);
  expect(result.value).toBeUndefined();
  expect(result.omitted).toBeGreaterThan(0);
});
