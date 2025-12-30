import type { Mat4 } from '../types/common';

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
    position: { x: number; y: number; z: number },
    yaw: number,
    pitch: number
): Mat4 => {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch); // TODO: Invert option for accessibility. Move negative to caller.
    const sinPitch = Math.sin(pitch); // NOT THAT KIND OF SIN! It's a sign! TODO: Move negative to caller.

    // Forward Vector from yaw/pitch
    const forwardX = cosYaw * cosPitch;
    const forwardY = sinPitch;
    const forwardZ = sinYaw * cosPitch;

    // World Up vector (positive Y is up)
    const worldUpX = 0;
    const worldUpY = 1;
    const worldUpZ = 0;

    // Right Vector from cross product of Forward and World Up
    const rightX = forwardY * worldUpZ - forwardZ * worldUpY;
    const rightY = forwardZ * worldUpX - forwardX * worldUpZ;
    const rightZ = forwardX * worldUpY - forwardY * worldUpX;

    // Normalize Right vector
    const rightLength = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
    const normalizedRightX = rightLength > 0 ? rightX / rightLength : 1;
    const normalizedRightY = rightLength > 0 ? rightY / rightLength : 0;
    const normalizedRightZ = rightLength > 0 ? rightZ / rightLength : 0;

    // Up Vector from cross product of Right and Forward
    const upX = normalizedRightY * forwardZ - normalizedRightZ * forwardY;
    const upY = normalizedRightZ * forwardX - normalizedRightX * forwardZ;
    const upZ = normalizedRightX * forwardY - normalizedRightY * forwardX;

    const e = new Float32Array(16);

    // Right (columns 0-2)
    e[0] = normalizedRightX;
    e[1] = normalizedRightY;
    e[2] = normalizedRightZ;

    // Up (columns 4-6)
    e[4] = upX;
    e[5] = upY;
    e[6] = upZ;

    // Forward (columns 8-10)
    e[8]  = forwardX;
    e[9]  = forwardY;
    e[10] = forwardZ;

    // Translation: The "where is the camera" part
    // This dots the position with the Right, Up, and Forward vectors
    e[12] = -(e[0] * position.x + e[4] * position.y + e[8] * position.z);
    e[13] = -(e[1] * position.x + e[5] * position.y + e[9] * position.z);
    e[14] = -(e[2] * position.x + e[6] * position.y + e[10] * position.z);
    e[15] = 1; // w

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
