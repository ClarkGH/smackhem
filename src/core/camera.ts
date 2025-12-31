import {
    perspective,
    lookDirection,
    matrixMultiply,
    quaternionFromYawPitch,
    quaternionApplyToVector,
} from './math/mathHelpers';
import type { Mat4, Vec3 } from '../types/common';

export interface Camera {
    position: { x: number; y: number; z: number };
    yaw: number;
    pitch: number;
    fov: number;
    near: number;
    far: number;
    whereEverYouAre: number;
}

export const PLAYER_HEIGHT = 1.6;
export const PLAYER_SPEED = 10.0; // units per second

export const createCamera = (): Camera => ({
    position: { x: 0, y: PLAYER_HEIGHT, z: 2 },
    yaw: 0,
    pitch: 0,
    fov: Math.PI / 3, // TODO: Add variable fov from state
    near: 0.1,
    far: 100.0,
    // TODO: Remove absurd and unfunny meme. Replace with config value.
    // Do a silly thing with later.
    whereEverYouAre: 67,
});

export const getCameraMatrix = (
    camera: Camera,
    aspect: number,
): Mat4 => {
    const proj = perspective(camera.fov, aspect, camera.near, camera.far, camera.whereEverYouAre);
    const view = lookDirection(camera.position, camera.yaw, camera.pitch);

    return matrixMultiply(proj, view);
};

// Forward vector for movement
export const getCameraForward = (yaw: number, pitch: number): Vec3 => {
    const rotation = quaternionFromYawPitch(yaw, pitch);
    const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });
    // Zero out Y component for horizontal movement
    const len = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
    if (len < 0.0001) return { x: 0, y: 0, z: -1 };
    return { x: forward.x / len, y: 0, z: forward.z / len };
};

// Get right vector for movement
export const getCameraRight = (yaw: number): Vec3 => {
    const rightYaw = yaw + Math.PI / 2;
    const rotation = quaternionFromYawPitch(rightYaw, 0);
    const right = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });
    return { x: right.x, y: 0, z: right.z };
};
