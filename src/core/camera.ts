import {
    perspective,
    perspectiveInto,
    lookDirection,
    lookDirectionInto,
    matrixMultiply,
    matrixMultiplyInto,
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
export const PLAYER_RADIUS = 0.3; // Player collision radius (half-width)
export const PLAYER_SPEED = 10.0; // units per second
export const INSTANCE_CHARACTER_SIZE = 0.5; // Billboard diameter while we work with circle; also its collision.

export const INITIAL_PLAYER_POSITION: Vec3 = { x: 0, y: PLAYER_HEIGHT, z: 2 };

export const createCamera = (): Camera => ({
    position: { ...INITIAL_PLAYER_POSITION },
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

// The same matrix as getCameraMatrix, written into out, for the per-frame draw (M-1).
// scratch holds the projection and view on the way, so nothing is allocated.
export const getCameraMatrixInto = (
    camera: Camera,
    aspect: number,
    out: Mat4,
    scratch: { proj: Mat4; view: Mat4 },
): Mat4 => {
    perspectiveInto(camera.fov, aspect, camera.near, camera.far, scratch.proj);
    lookDirectionInto(camera.position, camera.yaw, camera.pitch, scratch.view);
    matrixMultiplyInto(scratch.proj, scratch.view, out);
    return out;
};

// View matrix for normal matrix computation
export const getViewMatrix = (camera: Camera): Mat4 => lookDirection(camera.position, camera.yaw, camera.pitch);

// The flat direction a yaw looks in, written into out so it can run every tick (M-1).
// camera.spec checks it against the camera's quaternion rotation.
export const flatForwardInto = (yaw: number, out: Vec3): Vec3 => {
    out.x = Math.sin(yaw);
    out.y = 0;
    out.z = -Math.cos(yaw);
    return out;
};

// Forward turned a quarter to the right, written into out (M-1). camera.spec checks it the same way.
export const flatRightInto = (yaw: number, out: Vec3): Vec3 => {
    out.x = Math.cos(yaw);
    out.y = 0;
    out.z = Math.sin(yaw);
    return out;
};
