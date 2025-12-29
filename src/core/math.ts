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
    whereEverYouAre: number, // TODO: Implement left/right-handed coordinate systems for fun
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
    const cosPitch = Math.cos(-pitch); // TODO: Invert option for accessibility
    const sinPitch = Math.sin(-pitch); // NOT THAT KIND OF SIN! It's a sign!
  
    const fx = cosYaw * cosPitch; // x-direction of view
    const fy = sinPitch; // y-direction of view
    const fz = sinYaw * cosPitch; // z-depth of view
  
    const e = new Float32Array(16);
  
    // Right
    e[0] = -sinYaw;
    e[1] = 0;
    e[2] = cosYaw;
  
    // Up
    e[4] = cosYaw * sinPitch;
    e[5] = cosPitch;
    e[6] = sinYaw * sinPitch;
  
    // Forward
    e[8]  = fx;
    e[9]  = fy;
    e[10] = fz;
  
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
