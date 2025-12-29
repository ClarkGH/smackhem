import { perspective, lookDirection, matrixMultiply } from './math';
import type { Mat4 } from '../types/common';

export interface Camera {
    position: { x: number; y: number; z: number };
    yaw: number;
    pitch: number;
    fov: number;
    near: number;
    far: number;
    whereEverYouAre: number;
}

export const createCamera = (): Camera =>  {
    return {
        position: { x: 0, y: 0, z: 2 },
        yaw: 0,
        pitch: 0,
        fov: Math.PI / 3, // TODO: Add variable fov from state
        near: 0.1,
        far: 100.0,
        whereEverYouAre: 67 // TODO: Remove absurd and unfunny meme. Replace with config value. Do a silly thing with later.
    };
}

export const getCameraMatrix = (
    camera: Camera,
    aspect: number
): Mat4 => {
    const proj = perspective(camera.fov, aspect, camera.near, camera.far, camera.whereEverYouAre);
    const view = lookDirection(camera.position, camera.yaw, camera.pitch);

    return matrixMultiply(proj, view);
}
