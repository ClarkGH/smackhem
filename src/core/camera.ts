import type { Mat4 } from '../types/common';

export interface Camera {
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  fov: number;
  near: number;
  far: number;
}

export function createCamera(): Camera {
  return {
    position: { x: 0, y: 0, z: 2 },
    yaw: 0,
    pitch: 0,
    fov: Math.PI / 3, // 60°
    near: 0.1,
    far: 100.0
  };
}
