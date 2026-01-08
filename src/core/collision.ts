import type { Vec3 } from '../types/common';
import type { StaticMesh } from './world';
import AABB from './math/aabb';
import { extractPosition } from './math/mathHelpers';

export interface CollisionContext {
    newPos: Vec3;
    xOnlyPos: Vec3;
    zOnlyPos: Vec3;
    playerAABB: AABB;
    xOnlyAABB: AABB;
    zOnlyAABB: AABB;
}

export const createCollisionContext = (): CollisionContext => ({
    newPos: { x: 0, y: 0, z: 0 },
    xOnlyPos: { x: 0, y: 0, z: 0 },
    zOnlyPos: { x: 0, y: 0, z: 0 },
    playerAABB: new AABB(),
    xOnlyAABB: new AABB(),
    zOnlyAABB: new AABB(),
});

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

// Performance optimization: Update AABB in-place (zero allocation)
export const updatePlayerAABB = (
    position: Vec3,
    height: number,
    radius: number,
    out: AABB,
): void => {
    const centerY = position.y - height / 2;
    out.min.x = position.x - radius;
    out.min.y = centerY;
    out.min.z = position.z - radius;
    out.max.x = position.x + radius;
    out.max.y = centerY + height;
    out.max.z = position.z + radius;
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
    context: CollisionContext,
): Vec3 => {
    // Try full movement first, if collision detected, slide along surfaces or stop
    context.newPos.x = playerPos.x + movement.x;
    context.newPos.y = playerPos.y + movement.y;
    context.newPos.z = playerPos.z + movement.z;
    // Update AABB in-place (zero allocation)
    updatePlayerAABB(context.newPos, playerHeight, playerRadius, context.playerAABB);

    let hasCollision = false;
    for (let i = 0; i < worldAABBs.length; i += 1) {
        if (checkCollision(context.playerAABB, worldAABBs[i])) {
            hasCollision = true;
            break;
        }
    }

    if (!hasCollision) {
        return movement;
    }

    // Try X-only movement
    context.xOnlyPos.x = playerPos.x + movement.x;
    context.xOnlyPos.y = playerPos.y;
    context.xOnlyPos.z = playerPos.z;
    // Update AABB in-place (zero allocation)
    updatePlayerAABB(context.xOnlyPos, playerHeight, playerRadius, context.xOnlyAABB);
    let xCollision = false;
    for (let i = 0; i < worldAABBs.length; i += 1) {
        if (checkCollision(context.xOnlyAABB, worldAABBs[i])) {
            xCollision = true;
            break;
        }
    }

    // Try Z-only movement
    context.zOnlyPos.x = playerPos.x;
    context.zOnlyPos.y = playerPos.y;
    context.zOnlyPos.z = playerPos.z + movement.z;
    // Update AABB in-place (zero allocation)
    updatePlayerAABB(context.zOnlyPos, playerHeight, playerRadius, context.zOnlyAABB);
    let zCollision = false;
    for (let i = 0; i < worldAABBs.length; i += 1) {
        if (checkCollision(context.zOnlyAABB, worldAABBs[i])) {
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
