import { describe, it, expect } from 'vitest';
import { computeLightViewProj } from './shadowMath';
import { identity } from '../../../core/math/mathHelpers';
import type { Mat4, Vec3 } from '../../../types/common';

const HALF = 40;
const RADIUS = 100;
const SIZE = 2048;

const normalize = (v: Vec3): Vec3 => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return { x: v.x / len, y: v.y / len, z: v.z / len };
};

// Where a world point lands, in clip space (w is always 1 for this matrix)
const project = (m: Mat4, p: Vec3): Vec3 => {
    const e = m.elements;
    return {
        x: e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12],
        y: e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13],
        z: e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14],
    };
};

describe('computeLightViewProj', () => {
    const sun = normalize({ x: 0.5, y: 0.8, z: 0.3 });

    it('centres on focus, with depth growing away from the light', () => {
        const m = identity();
        const focus = { x: 0, y: 0, z: 0 };
        computeLightViewProj(sun, focus, HALF, RADIUS, SIZE, m);

        const centre = project(m, focus);
        expect(centre.x).toBeCloseTo(0, 5);
        expect(centre.y).toBeCloseTo(0, 5);
        expect(centre.z).toBeCloseTo(0, 5);

        // A point 50 units toward the light covers the same spot, but nearer
        const above = project(m, { x: sun.x * 50, y: sun.y * 50, z: sun.z * 50 });
        expect(above.x).toBeCloseTo(0, 5);
        expect(above.y).toBeCloseTo(0, 5);
        expect(above.z).toBeCloseTo(-0.5, 5);
    });

    it('handles a light straight overhead', () => {
        const m = identity();
        computeLightViewProj({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, HALF, RADIUS, SIZE, m);
        const edge = project(m, { x: HALF, y: 0, z: 0 });
        expect(Number.isFinite(edge.x)).toBe(true);
        expect(Math.abs(edge.x) + Math.abs(edge.y)).toBeCloseTo(1, 5);
    });

    it('keeps a fixed point on the same sub-texel spot as the focus moves (no shimmer)', () => {
        const m = identity();
        const ground = { x: 3.3, y: 0, z: -7.1 };
        const subTexel = (focusX: number): number => {
            computeLightViewProj(sun, { x: focusX, y: 1.7, z: 0 }, HALF, RADIUS, SIZE, m);
            const texelX = ((project(m, ground).x + 1) / 2) * SIZE;
            return texelX - Math.floor(texelX);
        };

        const first = subTexel(0);
        for (let i = 1; i < 50; i += 1) {
            expect(subTexel(i * 0.013)).toBeCloseTo(first, 3);
        }
    });
});
