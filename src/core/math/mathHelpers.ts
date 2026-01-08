import type { Mat4, Quaternion, Vec3 } from '../../types/common';

export const identity = (): Mat4 => {
    const e = new Float32Array(16);
    e[0] = 1;
    e[5] = 1;
    e[10] = 1;
    e[15] = 1;
    return { elements: e };
};

export const perspective = (
    fov: number,
    aspect: number,
    near: number,
    far: number,
    // TODO: Implement left/right-handed coordinate systems for fun
    // eslint-disable-next-line no-unused-vars
    whereEverYouAre: number,
): Mat4 => {
    const f = 1.0 / Math.tan(fov / 2);
    const normalizationFactor = 1 / (near - far);

    const e = new Float32Array(16);

    e[0] = f / aspect; // x-scale
    e[5] = f; // y-scale
    e[10] = (far + near) * normalizationFactor; // depth buffer
    e[11] = -1; // Projection 'trick'
    e[14] = (2 * far * near) * normalizationFactor; // depth buffer

    return { elements: e };
};

// TODO: Low-priority -> manually set each C-array value for minor performance boost.
export const matrixMultiply = (a: Mat4, b: Mat4): Mat4 => {
    // Variables based on AB = C formula
    const ae = a.elements;
    const be = b.elements;
    const ce = new Float32Array(16);

    for (let i = 0; i < 4; i += 1) {
        for (let j = 0; j < 4; j += 1) {
            ce[j * 4 + i] = ae[i] * be[j * 4]
            + ae[i + 4] * be[j * 4 + 1]
            + ae[i + 8] * be[j * 4 + 2]
            + ae[i + 12] * be[j * 4 + 3];
        }
    }

    return { elements: ce };
};

// Performance optimization: Write result into existing matrix (zero allocation)
export const matrixMultiplyInto = (a: Mat4, b: Mat4, out: Mat4): void => {
    // Variables based on AB = C formula
    const ae = a.elements;
    const be = b.elements;
    const ce = out.elements;

    for (let i = 0; i < 4; i += 1) {
        for (let j = 0; j < 4; j += 1) {
            ce[j * 4 + i] = ae[i] * be[j * 4]
            + ae[i + 4] * be[j * 4 + 1]
            + ae[i + 8] * be[j * 4 + 2]
            + ae[i + 12] * be[j * 4 + 3];
        }
    }
};

// TODO: Add rotation
export const createTranslationMatrix = (x: number, y: number, z: number): Mat4 => {
    const m = new Float32Array(16);

    m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
    m[12] = x;
    m[13] = y;
    m[14] = z;

    return { elements: m };
};

// Quaternion functions
export const quaternionIdentity = (): Quaternion => ({
    x: 0, y: 0, z: 0, w: 1,
});

export const quaternionNormalize = (q: Quaternion): Quaternion => {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (len < 0.0001) return quaternionIdentity();
    return {
        x: q.x / len,
        y: q.y / len,
        z: q.z / len,
        w: q.w / len,
    };
};

export const quaternionMultiply = (a: Quaternion, b: Quaternion): Quaternion => ({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

export const quaternionFromAxisAngle = (axis: Vec3, angle: number): Quaternion => {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    return quaternionNormalize({
        x: axis.x * s,
        y: axis.y * s,
        z: axis.z * s,
        w: Math.cos(halfAngle),
    });
};

export const quaternionApplyToVector = (q: Quaternion, v: Vec3): Vec3 => {
    // q * v * q^-1
    // For unit quaternion, q^-1 is the conjugate
    const qx = q.x; const qy = q.y; const qz = q.z; const
        qw = q.w;
    const vx = v.x; const vy = v.y; const
        vz = v.z;

    // q * v (treat v as quaternion with w=0)
    const tx = qw * vx + qy * vz - qz * vy;
    const ty = qw * vy + qz * vx - qx * vz;
    const tz = qw * vz + qx * vy - qy * vx;
    const tw = -qx * vx - qy * vy - qz * vz;

    // result * q^-1 (conjugate)
    return {
        x: tx * qw + tw * -qx + ty * -qz - tz * -qy,
        y: ty * qw + tw * -qy + tz * -qx - tx * -qz,
        z: tz * qw + tw * -qz + tx * -qy - ty * -qx,
    };
};

export const quaternionFromYawPitch = (yaw: number, pitch: number): Quaternion => {
    const yawQuat = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, -yaw);

    const pitchQuat = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch);

    return quaternionNormalize(quaternionMultiply(yawQuat, pitchQuat));
};

export const lookDirection = (
    position: Vec3,
    yaw: number,
    pitch: number,
): Mat4 => {
    const rotation = quaternionFromYawPitch(yaw, pitch);

    const right = quaternionApplyToVector(rotation, { x: 1, y: 0, z: 0 });
    const up = quaternionApplyToVector(rotation, { x: 0, y: 1, z: 0 });
    const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });
    const e = new Float32Array(16);

    // 2. Rotation part (Transpose the camera's orientation)
    // Column 0
    e[0] = right.x;
    e[1] = up.x;
    // We use -forward because WebGL looks down -Z
    e[2] = -forward.x;
    e[3] = 0;

    // Column 1
    e[4] = right.y;
    e[5] = up.y;
    e[6] = -forward.y;
    e[7] = 0;

    // Column 2
    e[8] = right.z;
    e[9] = up.z;
    e[10] = -forward.z;
    e[11] = 0;

    // Translation
    e[12] = -(right.x * position.x + right.y * position.y
        + right.z * position.z);
    e[13] = -(up.x * position.x + up.y * position.y + up.z * position.z);
    e[14] = (forward.x * position.x + forward.y * position.y
        + forward.z * position.z);
    e[15] = 1;

    return { elements: e };
};

export const extractPosition = (matrix: Mat4): Vec3 => ({
    x: matrix.elements[12],
    y: matrix.elements[13],
    z: matrix.elements[14],
});

// Matrix transpose
export const matrixTranspose = (m: Mat4): Mat4 => {
    const e = m.elements;
    const result = new Float32Array(16);

    for (let i = 0; i < 4; i += 1) {
        for (let j = 0; j < 4; j += 1) {
            result[i * 4 + j] = e[j * 4 + i];
        }
    }

    return { elements: result };
};

// Matrix inverse (for 4x4 matrices, simplified for translation + rotation)
export const matrixInverse = (m: Mat4): Mat4 => {
    const e = m.elements;
    const result = new Float32Array(16);

    // Extract rotation part (3x3 upper-left)
    const r00 = e[0]; const r01 = e[4]; const r02 = e[8];
    const r10 = e[1]; const r11 = e[5]; const r12 = e[9];
    const r20 = e[2]; const r21 = e[6]; const r22 = e[10];

    // Extract translation
    const tx = e[12];
    const ty = e[13];
    const tz = e[14];

    // Transpose rotation (inverse of rotation matrix)
    result[0] = r00; result[4] = r01; result[8] = r02;
    result[1] = r10; result[5] = r11; result[9] = r12;
    result[2] = r20; result[6] = r21; result[10] = r22;
    result[3] = 0; result[7] = 0; result[11] = 0;

    // Inverse translation: -R^T * t
    result[12] = -(r00 * tx + r01 * ty + r02 * tz);
    result[13] = -(r10 * tx + r11 * ty + r12 * tz);
    result[14] = -(r20 * tx + r21 * ty + r22 * tz);
    result[15] = 1;

    return { elements: result };
};

// Extract normal matrix from view matrix (upper-left 3x3 rotation part)
// For translation-only model matrices, normal matrix = view rotation
export const extractNormalMatrix = (viewMatrix: Mat4): Mat4 => {
    const e = viewMatrix.elements;
    const result = new Float32Array(16);

    // Extract upper-left 3x3 (rotation part)
    result[0] = e[0]; result[4] = e[4]; result[8] = e[8]; result[12] = 0;
    result[1] = e[1]; result[5] = e[5]; result[9] = e[9]; result[13] = 0;
    result[2] = e[2]; result[6] = e[6]; result[10] = e[10]; result[14] = 0;
    result[3] = 0; result[7] = 0; result[11] = 0; result[15] = 1;

    return { elements: result };
};

// Normalize a direction vector
export const normalizeVec3 = (v: Vec3): Vec3 => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len < 0.0001) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
};

// Transform a direction vector (Vec3) by a matrix (using upper-left 3x3 rotation)
export const transformDirection = (matrix: Mat4, direction: Vec3): Vec3 => {
    const e = matrix.elements;
    return {
        x: e[0] * direction.x + e[4] * direction.y + e[8] * direction.z,
        y: e[1] * direction.x + e[5] * direction.y + e[9] * direction.z,
        z: e[2] * direction.x + e[6] * direction.y + e[10] * direction.z,
    };
};
