import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { expect } from '#test-expect';

test('OBJ fixture contains two named objects and materials', async () => {
  const obj = await readFile(
    'tests/fixtures/obj/synthetic-plant.obj',
    'utf8',
  );
  const mtl = await readFile(
    'tests/fixtures/obj/synthetic-plant.mtl',
    'utf8',
  );
  expect(obj).toContain('o PrimaryPump');
  expect(obj).toContain('o BufferTank');
  expect(obj).toContain('mtllib synthetic-plant.mtl');
  expect(obj).toContain('f 1 2 4 3');
  expect(mtl).toContain('Kd 0.12 0.38 0.68');
});

test('OBJ failure and georeferenced fixtures are explicit', async () => {
  const large = await readFile(
    'tests/fixtures/obj/large-origin.obj',
    'utf8',
  );
  const empty = await readFile('tests/fixtures/obj/empty.obj', 'utf8');
  const truncated = await readFile(
    'tests/fixtures/obj/truncated.obj',
    'utf8',
  );

  expect(large).toContain('1000010.8');
  expect(empty).not.toContain('\nf ');
  expect(truncated).toContain('f 1 2\n');
});
