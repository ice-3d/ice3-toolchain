export type ICEMatrix4Tuple = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export function bakeLocalMatrix(
  matrix?: readonly number[],
  translation: readonly number[] = [0, 0, 0],
  rotation: readonly number[] = [0, 0, 0, 1],
  scale: readonly number[] = [1, 1, 1],
): ICEMatrix4Tuple {
  if (matrix !== undefined) {
    if (matrix.length !== 16 || matrix.some((value) => !Number.isFinite(value))) {
      throw new Error('ICE3_TOOL_INVALID_MATRIX: matrix must contain 16 finite values');
    }
    return [...matrix] as unknown as ICEMatrix4Tuple;
  }

  assertVector(translation, 3, 'translation');
  assertVector(rotation, 4, 'rotation');
  assertVector(scale, 3, 'scale');
  const [tx, ty, tz] = translation as [number, number, number];
  const [sx, sy, sz] = scale as [number, number, number];
  const quaternionLength = Math.hypot(...rotation);
  if (quaternionLength === 0) {
    throw new Error('ICE3_TOOL_INVALID_MATRIX: rotation quaternion is zero');
  }
  const [rx, ry, rz, rw] = rotation.map((value) => value / quaternionLength) as [
    number,
    number,
    number,
    number,
  ];
  const x2 = rx + rx;
  const y2 = ry + ry;
  const z2 = rz + rz;
  const xx = rx * x2;
  const xy = rx * y2;
  const xz = rx * z2;
  const yy = ry * y2;
  const yz = ry * z2;
  const zz = rz * z2;
  const wx = rw * x2;
  const wy = rw * y2;
  const wz = rw * z2;

  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function assertVector(value: readonly number[], length: number, field: string): void {
  if (value.length !== length || value.some((item) => !Number.isFinite(item))) {
    throw new Error(
      `ICE3_TOOL_INVALID_MATRIX: ${field} must contain ${length} finite values`,
    );
  }
}
