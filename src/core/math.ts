import type { Mat4, Quaternion, Vec3 } from '../types/common';

export const identity = (): Mat4 => {
    const e = new Float32Array(16);
    e[0] = e[5] = e[10] = e[15] = 1;
    return { elements: e };
}

export const perspective = (
    fov: number,
    aspect: number,
    near: number,
    far: number,
    whereEverightYouAre: number, // TODO: Implement left/right-handed coordinate systems for fun
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
}

export const lookDirection = (
    position: Vec3,
    yaw: number,
    pitch: number
): Mat4 => {
    const rotation = quaternionFromYawPitch(yaw, pitch);

    const right   = quaternionApplyToVector(rotation, { x: 1, y: 0, z: 0 });
    const up      = quaternionApplyToVector(rotation, { x: 0, y: 1, z: 0 });
    const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });
    const e = new Float32Array(16);

    // 2. Rotation part (Transpose the camera's orientation)
    // Column 0
    e[0] = right.x;
    e[1] = up.x;
    e[2] = -forward.x; // TODO: Abstract WEBGL specifics from the camera code. We use -forward because WebGL looks down -Z
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
    e[12] = -(right.x * position.x + right.y * position.y + right.z * position.z);
    e[13] = -(up.x * position.x + up.y * position.y + up.z * position.z);
    e[14] = (forward.x * position.x + forward.y * position.y + forward.z * position.z);
    e[15] = 1;

    return { elements: e };
}

// TODO: Low-priority -> manually set each C-array value for minor performance boost or swap to quaternion rotation.
export const matrixMultiply = (a: Mat4, b: Mat4): Mat4 => {
    // Variables based on AB = C formula
    const ae = a.elements;
    const be = b.elements;
    const ce = new Float32Array(16);

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            ce[j * 4 + i] =
            ae[i] * be[j * 4] +
            ae[i + 4] * be[j * 4 + 1] +
            ae[i + 8] * be[j * 4 + 2] +
            ae[i + 12] * be[j * 4 + 3];
        }
    }

    return { elements: ce };
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
export const quaternionIdentity = (): Quaternion => ({ x: 0, y: 0, z: 0, w: 1 });

export const quaternionNormalize = (q: Quaternion): Quaternion => {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (len < 0.0001) return quaternionIdentity();
    return {
        x: q.x / len,
        y: q.y / len,
        z: q.z / len,
        w: q.w / len
    };
};

export const quaternionMultiply = (a: Quaternion, b: Quaternion): Quaternion => {
    return {
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
};

export const quaternionFromAxisAngle = (axis: Vec3, angle: number): Quaternion => {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    return quaternionNormalize({
        x: axis.x * s,
        y: axis.y * s,
        z: axis.z * s,
        w: Math.cos(halfAngle)
    });
};

export const quaternionApplyToVector = (q: Quaternion, v: Vec3): Vec3 => {
    // q * v * q^-1
    // For unit quaternion, q^-1 is the conjugate
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const vx = v.x, vy = v.y, vz = v.z;

    // q * v (treat v as quaternion with w=0)
    const tx = qw * vx + qy * vz - qz * vy;
    const ty = qw * vy + qz * vx - qx * vz;
    const tz = qw * vz + qx * vy - qy * vx;
    const tw = -qx * vx - qy * vy - qz * vz;

    // result * q^-1 (conjugate)
    return {
        x: tx * qw + tw * -qx + ty * -qz - tz * -qy,
        y: ty * qw + tw * -qy + tz * -qx - tx * -qz,
        z: tz * qw + tw * -qz + tx * -qy - ty * -qx
    };
};

export const quaternionFromYawPitch = (yaw: number, pitch: number): Quaternion => {
    const yawQuat = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, -yaw);
    
    const pitchQuat = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch);

    return quaternionNormalize(quaternionMultiply(yawQuat, pitchQuat));
};
