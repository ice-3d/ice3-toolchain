import type { ICEWWTPMeshData } from './types.js';

function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`ICE3_WWTP_GEOMETRY_INVALID: ${name} must be positive`);
  }
}

function segments(value: number): void {
  if (!Number.isInteger(value) || value < 8 || value > 64) {
    throw new Error(
      'ICE3_WWTP_GEOMETRY_INVALID: segments must be an integer from 8 to 64',
    );
  }
}

function finish(
  positions: number[],
  normals: number[],
  indices: number[],
): ICEWWTPMeshData {
  return Object.freeze({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  });
}

export function createBox(
  width: number,
  height: number,
  depth: number,
): ICEWWTPMeshData {
  positive(width, 'width');
  positive(height, 'height');
  positive(depth, 'depth');
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faces = [
    { normal: [1, 0, 0], corners: [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]] },
    { normal: [-1, 0, 0], corners: [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]] },
    { normal: [0, 1, 0], corners: [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]] },
    { normal: [0, -1, 0], corners: [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]] },
    { normal: [0, 0, 1], corners: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { normal: [0, 0, -1], corners: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
  ] as const;
  for (const face of faces) {
    const base = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(...corner);
      normals.push(...face.normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return finish(positions, normals, indices);
}

export function createOpenCylinder(
  radius: number,
  height: number,
  segmentCount = 16,
): ICEWWTPMeshData {
  positive(radius, 'radius');
  positive(height, 'height');
  segments(segmentCount);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const half = height / 2;
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = index / segmentCount * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    positions.push(x * radius, -half, z * radius);
    normals.push(x, 0, z);
    positions.push(x * radius, half, z * radius);
    normals.push(x, 0, z);
  }
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % segmentCount;
    const bottom = index * 2;
    const top = bottom + 1;
    const nextBottom = next * 2;
    const nextTop = nextBottom + 1;
    indices.push(bottom, nextBottom, nextTop, bottom, nextTop, top);
  }
  return finish(positions, normals, indices);
}

export function createCylinder(
  radius: number,
  height: number,
  segmentCount = 16,
): ICEWWTPMeshData {
  const wall = createOpenCylinder(radius, height, segmentCount);
  const positions = [...wall.positions];
  const normals = [...wall.normals];
  const indices = [...wall.indices];
  const half = height / 2;
  const bottomCenter = positions.length / 3;
  positions.push(0, -half, 0);
  normals.push(0, -1, 0);
  const topCenter = positions.length / 3;
  positions.push(0, half, 0);
  normals.push(0, 1, 0);
  const bottomStart = positions.length / 3;
  const topStart = bottomStart + segmentCount;
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = index / segmentCount * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.push(x, -half, z);
    normals.push(0, -1, 0);
    positions.push(x, half, z);
    normals.push(0, 1, 0);
  }
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % segmentCount;
    indices.push(
      bottomCenter,
      bottomStart + next,
      bottomStart + index,
      topCenter,
      topStart + index,
      topStart + next,
    );
  }
  return finish(positions, normals, indices);
}

export function createFrustum(
  bottomRadius: number,
  topRadius: number,
  height: number,
  segmentCount = 24,
): ICEWWTPMeshData {
  positive(height, 'height');
  segments(segmentCount);
  if (
    !Number.isFinite(bottomRadius)
    || !Number.isFinite(topRadius)
    || bottomRadius < 0
    || topRadius < 0
    || (bottomRadius === 0 && topRadius === 0)
  ) {
    throw new Error(
      'ICE3_WWTP_GEOMETRY_INVALID: frustum radii must be finite and non-negative',
    );
  }
  const half = height / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = index / segmentCount * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    positions.push(
      x * bottomRadius, -half, z * bottomRadius,
      x * topRadius, half, z * topRadius,
    );
    const normalX = x * height;
    const normalY = bottomRadius - topRadius;
    const normalZ = z * height;
    const length = Math.hypot(normalX, normalY, normalZ);
    const nx = normalX / length;
    const ny = normalY / length;
    const nz = normalZ / length;
    normals.push(nx, ny, nz, nx, ny, nz);
  }
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % segmentCount;
    const bottom = index * 2;
    const top = bottom + 1;
    const nextBottom = next * 2;
    const nextTop = nextBottom + 1;
    indices.push(bottom, nextBottom, nextTop, bottom, nextTop, top);
  }

  if (bottomRadius > 0) {
    const center = positions.length / 3;
    positions.push(0, -half, 0);
    normals.push(0, -1, 0);
    const start = positions.length / 3;
    for (let index = 0; index < segmentCount; index += 1) {
      const angle = index / segmentCount * Math.PI * 2;
      positions.push(
        Math.cos(angle) * bottomRadius,
        -half,
        Math.sin(angle) * bottomRadius,
      );
      normals.push(0, -1, 0);
    }
    for (let index = 0; index < segmentCount; index += 1) {
      const next = (index + 1) % segmentCount;
      indices.push(center, start + next, start + index);
    }
  }

  if (topRadius > 0) {
    const center = positions.length / 3;
    positions.push(0, half, 0);
    normals.push(0, 1, 0);
    const start = positions.length / 3;
    for (let index = 0; index < segmentCount; index += 1) {
      const angle = index / segmentCount * Math.PI * 2;
      positions.push(
        Math.cos(angle) * topRadius,
        half,
        Math.sin(angle) * topRadius,
      );
      normals.push(0, 1, 0);
    }
    for (let index = 0; index < segmentCount; index += 1) {
      const next = (index + 1) % segmentCount;
      indices.push(center, start + index, start + next);
    }
  }
  return finish(positions, normals, indices);
}

export function createRing(
  outerRadius: number,
  innerRadius: number,
  height: number,
  segmentCount = 32,
): ICEWWTPMeshData {
  positive(outerRadius, 'outer radius');
  positive(height, 'height');
  segments(segmentCount);
  if (
    !Number.isFinite(innerRadius)
    || innerRadius <= 0
    || innerRadius >= outerRadius
  ) {
    throw new Error(
      'ICE3_WWTP_GEOMETRY_INVALID: inner radius must be positive and smaller than outer radius',
    );
  }
  const half = height / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const quad = (
    points: readonly [
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
    ],
    normal: readonly [number, number, number],
  ): void => {
    const base = positions.length / 3;
    for (const point of points) {
      positions.push(...point);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = index / segmentCount * Math.PI * 2;
    const nextAngle = (index + 1) / segmentCount * Math.PI * 2;
    const ox = Math.cos(angle);
    const oz = Math.sin(angle);
    const nox = Math.cos(nextAngle);
    const noz = Math.sin(nextAngle);
    const ix = ox * innerRadius;
    const iz = oz * innerRadius;
    const nix = nox * innerRadius;
    const niz = noz * innerRadius;
    const orx = ox * outerRadius;
    const orz = oz * outerRadius;
    const norx = nox * outerRadius;
    const norz = noz * outerRadius;
    quad([
      [orx, -half, orz],
      [norx, -half, norz],
      [norx, half, norz],
      [orx, half, orz],
    ], [ox, 0, oz]);
    quad([
      [nix, -half, niz],
      [ix, -half, iz],
      [ix, half, iz],
      [nix, half, niz],
    ], [-ox, 0, -oz]);
    quad([
      [ix, half, iz],
      [nix, half, niz],
      [norx, half, norz],
      [orx, half, orz],
    ], [0, 1, 0]);
    quad([
      [orx, -half, orz],
      [norx, -half, norz],
      [nix, -half, niz],
      [ix, -half, iz],
    ], [0, -1, 0]);
  }
  return finish(positions, normals, indices);
}

export function createPipeSegment(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  radius: number,
  segmentCount = 12,
): ICEWWTPMeshData {
  positive(radius, 'radius');
  segments(segmentCount);
  if (
    [...from, ...to].some((value) => !Number.isFinite(value))
    || Math.hypot(
      to[0] - from[0],
      to[1] - from[1],
      to[2] - from[2],
    ) <= 1e-9
  ) {
    throw new Error(
      'ICE3_WWTP_GEOMETRY_INVALID: pipe endpoints must be finite and distinct',
    );
  }
  const direction = normalize([
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  ]);
  const reference = Math.abs(direction[1]) < 0.9
    ? [0, 1, 0] as const
    : [1, 0, 0] as const;
  const basisU = normalize(cross(direction, reference));
  const basisV = normalize(cross(direction, basisU));
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = index / segmentCount * Math.PI * 2;
    const radial = add(
      scale(basisU, Math.cos(angle)),
      scale(basisV, Math.sin(angle)),
    );
    const normal = normalize(radial);
    positions.push(
      from[0] + normal[0] * radius,
      from[1] + normal[1] * radius,
      from[2] + normal[2] * radius,
      to[0] + normal[0] * radius,
      to[1] + normal[1] * radius,
      to[2] + normal[2] * radius,
    );
    normals.push(...normal, ...normal);
  }
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % segmentCount;
    const start = index * 2;
    indices.push(start, next * 2, next * 2 + 1, start, next * 2 + 1, start + 1);
  }
  const fromCenter = positions.length / 3;
  positions.push(...from);
  normals.push(...scale(direction, -1));
  const toCenter = positions.length / 3;
  positions.push(...to);
  normals.push(...direction);
  const fromRing = positions.length / 3;
  const toRing = fromRing + segmentCount;
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = index / segmentCount * Math.PI * 2;
    const radial = add(
      scale(basisU, Math.cos(angle)),
      scale(basisV, Math.sin(angle)),
    );
    const normal = normalize(radial);
    positions.push(
      from[0] + normal[0] * radius,
      from[1] + normal[1] * radius,
      from[2] + normal[2] * radius,
      to[0] + normal[0] * radius,
      to[1] + normal[1] * radius,
      to[2] + normal[2] * radius,
    );
    normals.push(...scale(direction, -1), ...direction);
  }
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % segmentCount;
    indices.push(
      fromCenter,
      fromRing + next,
      fromRing + index,
      toCenter,
      toRing + index,
      toRing + next,
    );
  }
  return finish(positions, normals, indices);
}

type Vector = readonly [number, number, number];

function add(left: Vector, right: Vector): [number, number, number] {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ];
}

function scale(vector: Vector, amount: number): [number, number, number] {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function cross(left: Vector, right: Vector): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: Vector): [number, number, number] {
  const length = Math.hypot(...vector);
  if (length <= 1e-9) {
    throw new Error('ICE3_WWTP_GEOMETRY_INVALID: vector has zero length');
  }
  return scale(vector, 1 / length);
}
