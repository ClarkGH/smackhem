import { Vec3 } from 'src/types/common';

export interface AABB {
    min: Vec3;
    max: Vec3;
}

export const createAABB = (
    min: Vec3 = { x: 0, y: 0, z: 0 },
    max: Vec3 = { x: 0, y: 0, z: 0 },
): AABB => ({
    min,
    max,
});

export const aabbContains = (aabb: AABB, point: Vec3): boolean => (
    point.x >= aabb.min.x && point.x <= aabb.max.x
    && point.y >= aabb.min.y && point.y <= aabb.max.y
    && point.z >= aabb.min.z && point.z <= aabb.max.z
);

export const aabbIntersects = (a: AABB, b: AABB): boolean => (
    a.min.x <= b.max.x && a.max.x >= b.min.x
    && a.min.y <= b.max.y && a.max.y >= b.min.y
    && a.min.z <= b.max.z && a.max.z >= b.min.z
);

export const aabbGetCenter = (aabb: AABB): Vec3 => ({
    x: (aabb.min.x + aabb.max.x) / 2,
    y: (aabb.min.y + aabb.max.y) / 2,
    z: (aabb.min.z + aabb.max.z) / 2,
});

export const aabbGetSize = (aabb: AABB): Vec3 => ({
    x: aabb.max.x - aabb.min.x,
    y: aabb.max.y - aabb.min.y,
    z: aabb.max.z - aabb.min.z,
});

// Default export for backward compatibility during migration
export default createAABB;
