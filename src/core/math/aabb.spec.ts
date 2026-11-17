import { describe, it, expect } from 'vitest';
import {
    aabbContains,
    aabbGetCenter,
    aabbGetSize,
    aabbIntersects,
    createAABB,
    type AABB,
} from './aabb';

// A unit cube from (0, 0, 0) to (1, 1, 1)
const unitCube = (): AABB => createAABB({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });

// The unit cube moved by (dx, dy, dz)
const shifted = (dx: number, dy: number, dz: number): AABB => createAABB(
    { x: dx, y: dy, z: dz },
    { x: 1 + dx, y: 1 + dy, z: 1 + dz },
);

describe('createAABB', () => {
    it('gives each default box its own min and max', () => {
        // Collision fills scratch boxes in place, so two defaults must not share vectors
        const a = createAABB();
        const b = createAABB();
        a.min.x = 5;
        a.max.x = 6;

        expect(b.min.x).toBe(0);
        expect(b.max.x).toBe(0);
        expect(a.min).not.toBe(a.max);
    });
});

describe('aabbContains', () => {
    it('contains a point inside', () => {
        expect(aabbContains(unitCube(), { x: 0.5, y: 0.5, z: 0.5 })).toBe(true);
    });

    it('counts a point on a face, edge or corner as inside', () => {
        const box = unitCube();

        expect(aabbContains(box, { x: 1, y: 0.5, z: 0.5 })).toBe(true);
        expect(aabbContains(box, { x: 0, y: 0, z: 0.5 })).toBe(true);
        expect(aabbContains(box, { x: 1, y: 1, z: 1 })).toBe(true);
    });

    it('rejects a point outside on any one axis', () => {
        const box = unitCube();

        expect(aabbContains(box, { x: 1.01, y: 0.5, z: 0.5 })).toBe(false);
        expect(aabbContains(box, { x: 0.5, y: -0.01, z: 0.5 })).toBe(false);
        expect(aabbContains(box, { x: 0.5, y: 0.5, z: 1.01 })).toBe(false);
    });
});

describe('aabbIntersects', () => {
    it('intersects an overlapping box, both ways round', () => {
        const a = unitCube();
        const b = shifted(0.5, 0.5, 0.5);

        expect(aabbIntersects(a, b)).toBe(true);
        expect(aabbIntersects(b, a)).toBe(true);
    });

    it('intersects a box fully inside it', () => {
        const outer = createAABB({ x: -2, y: -2, z: -2 }, { x: 2, y: 2, z: 2 });

        expect(aabbIntersects(outer, unitCube())).toBe(true);
        expect(aabbIntersects(unitCube(), outer)).toBe(true);
    });

    it('counts boxes that only touch on a face as intersecting', () => {
        // Inclusive edges: a player flush against a wall reads as colliding
        expect(aabbIntersects(unitCube(), shifted(1, 0, 0))).toBe(true);
        expect(aabbIntersects(unitCube(), shifted(0, 1, 0))).toBe(true);
        expect(aabbIntersects(unitCube(), shifted(0, 0, -1))).toBe(true);
    });

    it('does not intersect when separated on any one axis', () => {
        // Overlapping on the other two axes, so each axis check is tested on its own
        expect(aabbIntersects(unitCube(), shifted(1.01, 0, 0))).toBe(false);
        expect(aabbIntersects(unitCube(), shifted(0, -1.01, 0))).toBe(false);
        expect(aabbIntersects(unitCube(), shifted(0, 0, 1.01))).toBe(false);
    });
});

describe('aabbGetCenter and aabbGetSize', () => {
    it('works for a box away from the origin', () => {
        const box = createAABB({ x: -3, y: 1, z: 2 }, { x: 1, y: 2, z: 8 });

        expect(aabbGetCenter(box)).toEqual({ x: -1, y: 1.5, z: 5 });
        expect(aabbGetSize(box)).toEqual({ x: 4, y: 1, z: 6 });
    });

    it('gives a zero size for a default box', () => {
        expect(aabbGetSize(createAABB())).toEqual({ x: 0, y: 0, z: 0 });
    });
});
