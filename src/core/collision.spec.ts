import { describe, it, expect } from 'vitest';
import type { Vec3 } from '../types/common';
import { createAABB, type AABB } from './math/aabb';
import { createCollisionContext, resolveCollision, updatePlayerAABB } from './collision';

const HEIGHT = 2;
const RADIUS = 0.5;

// Player stands at the origin, so its box is x and z -0.5..0.5
const ORIGIN: Vec3 = { x: 0, y: HEIGHT, z: 0 };

// Walls run from y -10 to 10, so where the player's box sits on y can't change the result
const wall = (minX: number, minZ: number, maxX: number, maxZ: number): AABB => createAABB(
    { x: minX, y: -10, z: minZ },
    { x: maxX, y: 10, z: maxZ },
);

const resolve = (movement: Vec3, walls: AABB[], from: Vec3 = ORIGIN): Vec3 => ({
    ...resolveCollision(from, movement, walls, HEIGHT, RADIUS, createCollisionContext()),
});

describe('updatePlayerAABB', () => {
    it('is radius out from the position on x and z, and height tall', () => {
        const out = createAABB({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

        updatePlayerAABB({ x: 3, y: 1.6, z: -2 }, 1.6, 0.3, out);

        expect(out.min.x).toBeCloseTo(2.7);
        expect(out.max.x).toBeCloseTo(3.3);
        expect(out.min.z).toBeCloseTo(-2.3);
        expect(out.max.z).toBeCloseTo(-1.7);
        expect(out.max.y - out.min.y).toBeCloseTo(1.6);
    });
});

describe('resolveCollision', () => {
    it('keeps the whole move when nothing is in the way', () => {
        const movement = { x: 0.2, y: 0.1, z: -0.3 };

        expect(resolve(movement, [])).toEqual(movement);
        // A wall nearby, but not reached
        expect(resolve(movement, [wall(1, -5, 2, 5)])).toEqual(movement);
    });

    it('stops dead walking straight into a wall', () => {
        expect(resolve({ x: 0.2, y: 0, z: 0 }, [wall(0.6, -5, 1, 5)])).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('slides along a wall on x when walking into it at an angle', () => {
        expect(resolve({ x: 0.2, y: 0, z: 0.1 }, [wall(0.6, -5, 1, 5)])).toEqual({ x: 0, y: 0, z: 0.1 });
    });

    it('slides along a wall on z when walking into it at an angle', () => {
        expect(resolve({ x: -0.1, y: 0, z: -0.2 }, [wall(-5, -1, 5, -0.6)])).toEqual({ x: -0.1, y: 0, z: 0 });
    });

    describe('heading into a corner, where each axis alone is clear', () => {
        // Near corner at (0.6, 0.6): a step of 0.2 on x or 0.15 on z alone stays outside it
        const corner = [wall(0.6, 0.6, 2, 2)];

        it('slides along x when moving more on x', () => {
            expect(resolve({ x: 0.2, y: 0, z: 0.15 }, corner)).toEqual({ x: 0.2, y: 0, z: 0 });
        });

        it('slides along z when moving more on z', () => {
            expect(resolve({ x: 0.15, y: 0, z: 0.2 }, corner)).toEqual({ x: 0, y: 0, z: 0.2 });
        });

        it('slides along x on an exact tie', () => {
            expect(resolve({ x: 0.2, y: 0, z: 0.2 }, corner)).toEqual({ x: 0.2, y: 0, z: 0 });
        });
    });

    it('stops in an inside corner where each axis hits a different wall', () => {
        const walls = [wall(0.6, -5, 1, 5), wall(-5, 0.6, 5, 1)];

        expect(resolve({ x: 0.2, y: 0, z: 0.2 }, walls)).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('finds the blocking wall wherever it is in the list', () => {
        const far = wall(50, 50, 51, 51);

        expect(resolve({ x: 0.2, y: 0, z: 0 }, [far, far, wall(0.6, -5, 1, 5)])).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('passes y through untouched, even when blocked', () => {
        expect(resolve({ x: 0.2, y: 0.1, z: 0 }, [wall(0.6, -5, 1, 5)]).y).toBe(0.1);
    });

    it('is stuck when standing exactly flush against a wall, even moving along it', () => {
        // Touching counts as intersecting (aabb.spec), so every try touches the wall.
        // Pins today's behavior; walking normally stops short of flush.
        const flush = { x: 0.5, y: HEIGHT, z: 0 };

        expect(resolve({ x: 0, y: 0, z: 0.2 }, [wall(1, -5, 2, 5)], flush)).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('returns the context scratch vector, so the next call overwrites it', () => {
        const context = createCollisionContext();
        const first = resolveCollision(ORIGIN, { x: 0.1, y: 0, z: 0 }, [], HEIGHT, RADIUS, context);
        const second = resolveCollision(ORIGIN, { x: 0.3, y: 0, z: 0 }, [], HEIGHT, RADIUS, context);

        expect(first).toBe(context.resolvedMovement);
        expect(second).toBe(first);
        expect(first.x).toBe(0.3);
    });
});
