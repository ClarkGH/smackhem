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
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch); // NOT THAT KIND OF SIN! It's a sign!
  
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
  
    // Translation
    e[12] = -position.x;
    e[13] = -position.y;
    e[14] = -position.z;
    e[15] = 1;
  
    return { elements: e };
}
