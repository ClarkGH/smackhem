import type { Vec3 } from '../types/common';
import type { StaticMesh } from './world';
import AABB from './math/aabb';
import { extractPosition } from './math/mathHelpers';

// TODO: review if we want to be cylinder or box
// Player AABB is a capsule-like box: centered at (position.x, position.y - height/2, position.z)
// with size (radius*2, height, radius*2)
export const getPlayerAABB = (position: Vec3, height: number, radius: number): AABB => {
    const centerY = position.y - height / 2;
    return new AABB(
        {
            x: position.x - radius,
            y: centerY,
            z: position.z - radius,
        },
        {
            x: position.x + radius,
            y: centerY + height,
            z: position.z + radius,
        },
    );
};

// Extract AABB from a mesh transform
// For cubes: extract position from transform, create AABB with size based on mesh type
export const getMeshAABB = (mesh: StaticMesh, meshSize: number): AABB => {
    const position = extractPosition(mesh.transform);
    const halfSize = meshSize / 2;
    return new AABB(
        {
            x: position.x - halfSize,
            y: position.y - halfSize,
            z: position.z - halfSize,
        },
        {
            x: position.x + halfSize,
            y: position.y + halfSize,
            z: position.z + halfSize,
        },
    );
};

export const checkCollision = (
    playerAABB: AABB,
    worldAABB: AABB,
): boolean => playerAABB.intersects(worldAABB);

export const resolveCollision = (
    playerPos: Vec3,
    movement: Vec3,
    worldAABBs: AABB[],
    playerHeight: number,
    playerRadius: number,
): Vec3 => {
    // Try full movement first, if collision detected, slide along surfaces or stop
    const newPos = {
        x: playerPos.x + movement.x,
        y: playerPos.y + movement.y,
        z: playerPos.z + movement.z,
    };
    const playerAABB = getPlayerAABB(newPos, playerHeight, playerRadius);

    let hasCollision = false;
    for (let i = 0; i < worldAABBs.length; i += 1) {
        if (checkCollision(playerAABB, worldAABBs[i])) {
            hasCollision = true;
            break;
        }
    }

    if (!hasCollision) {
        return movement;
    }

    // Try X-only movement
    const xOnlyPos = {
        x: playerPos.x + movement.x,
        y: playerPos.y,
        z: playerPos.z,
    };
    const xOnlyAABB = getPlayerAABB(xOnlyPos, playerHeight, playerRadius);
    let xCollision = false;
    for (let i = 0; i < worldAABBs.length; i += 1) {
        if (checkCollision(xOnlyAABB, worldAABBs[i])) {
            xCollision = true;
            break;
        }
    }

    // Try Z-only movement
    const zOnlyPos = {
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z + movement.z,
    };
    const zOnlyAABB = getPlayerAABB(zOnlyPos, playerHeight, playerRadius);
    let zCollision = false;
    for (let i = 0; i < worldAABBs.length; i += 1) {
        if (checkCollision(zOnlyAABB, worldAABBs[i])) {
            zCollision = true;
            break;
        }
    }

    // Return resolved movement
    return {
        x: xCollision ? 0 : movement.x,
        y: movement.y, // Keep Y movement as-is for now
        z: zCollision ? 0 : movement.z,
    };
};
