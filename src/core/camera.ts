import { perspective, lookDirection } from './math';
import type { Mat4 } from '../types/common';

export interface Camera {
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  fov: number;
  near: number;
  far: number;
}

export const createCamera = (): Camera =>  {
  return {
    position: { x: 0, y: 0, z: 2 },
    yaw: 0,
    pitch: 0,
    fov: Math.PI / 3, // 60°
    near: 0.1,
    far: 100.0
  };
}

export const getCameraMatrix = (
  camera: Camera,
  aspect: number
): Mat4 => {
  const proj = perspective(camera.fov, aspect, camera.near, camera.far);
  const view = lookDirection(camera.position, camera.yaw, camera.pitch);

  // TODO: Add Matrix multiplication for movement
  return {
    elements: proj.elements
  };
}
