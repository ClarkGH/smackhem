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
  far: number
): Mat4 => {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);

  const e = new Float32Array(16);
  e[0] = f / aspect;
  e[5] = f;
  e[10] = (far + near) * nf;
  e[11] = -1;
  e[14] = (2 * far * near) * nf;

  return { elements: e };
}

export const lookDirection = (
    position: { x: number; y: number; z: number },
    yaw: number,
    pitch: number
  ): Mat4 => {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
  
    const fx = cy * cp;
    const fy = sp;
    const fz = sy * cp;
  
    const e = new Float32Array(16);
  
    // Right
    e[0] = -sy;
    e[1] = 0;
    e[2] = cy;
  
    // Up
    e[4] = cy * sp;
    e[5] = cp;
    e[6] = sy * sp;
  
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
