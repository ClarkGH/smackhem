import { describe, it, expect } from 'vitest';
import {
    fitLogicalOrtho,
    lookDirectionInto,
    perspective,
    perspectiveInto,
    quaternionApplyToVector,
    quaternionFromYawPitch,
} from './mathHelpers';
import type { Mat4 } from '../../types/common';

const newMat4 = (): Mat4 => ({ elements: new Float32Array(16) });

describe('lookDirectionInto', () => {
    // Yaw and pitch pairs covering every quadrant, straight up and down nearly, and the start
    const VIEWS = [[0, 0], [0.7, 0.3], [Math.PI / 2, -0.5], [2.5, 1.2], [Math.PI, 0], [-1.2, -1.5]];

    it('turns the camera the same way the quaternion maths did', () => {
        VIEWS.forEach(([yaw, pitch]) => {
            const rotation = quaternionFromYawPitch(yaw, pitch);
            const right = quaternionApplyToVector(rotation, { x: 1, y: 0, z: 0 });
            const up = quaternionApplyToVector(rotation, { x: 0, y: 1, z: 0 });
            const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });
            const e = lookDirectionInto({ x: 0, y: 0, z: 0 }, yaw, pitch, newMat4()).elements;

            // Rows of the rotation part are right, up and -forward
            [[e[0], e[4], e[8], right], [e[1], e[5], e[9], up], [e[2], e[6], e[10], forward]].forEach(([x, y, z, axis], row) => {
                const sign = row === 2 ? -1 : 1;
                const v = axis as { x: number; y: number; z: number };
                expect(x).toBeCloseTo(sign * v.x, 5);
                expect(y).toBeCloseTo(sign * v.y, 5);
                expect(z).toBeCloseTo(sign * v.z, 5);
            });
        });
    });

    it('moves the world opposite to the camera, so the camera sits at the origin', () => {
        const position = { x: 3, y: 1.6, z: -7 };
        VIEWS.forEach(([yaw, pitch]) => {
            const e = lookDirectionInto(position, yaw, pitch, newMat4()).elements;
            // The camera's own position lands on the view origin
            const vx = e[0] * position.x + e[4] * position.y + e[8] * position.z + e[12];
            const vy = e[1] * position.x + e[5] * position.y + e[9] * position.z + e[13];
            const vz = e[2] * position.x + e[6] * position.y + e[10] * position.z + e[14];
            expect(vx).toBeCloseTo(0, 4);
            expect(vy).toBeCloseTo(0, 4);
            expect(vz).toBeCloseTo(0, 4);
        });
    });

    it('writes into the matrix it is given', () => {
        const out = newMat4();
        expect(lookDirectionInto({ x: 0, y: 0, z: 0 }, 1, 0.2, out)).toBe(out);
    });
});

describe('perspectiveInto', () => {
    it('matches perspective, and leaves nothing behind in a reused matrix', () => {
        const out = newMat4();
        out.elements.fill(9);

        perspectiveInto(Math.PI / 3, 16 / 9, 0.1, 100, out);

        expect(Array.from(out.elements)).toEqual(Array.from(perspective(Math.PI / 3, 16 / 9, 0.1, 100, 67).elements));
    });
});

const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 600;

// Visible area's aspect matches the viewport, so nothing is stretched
const aspectOf = (b: ReturnType<typeof fitLogicalOrtho>): number => (b.right - b.left) / (b.bottom - b.top);

describe('fitLogicalOrtho', () => {
    it('shows exactly the logical area at the same aspect (4:3)', () => {
        expect(fitLogicalOrtho(1024, 768, LOGICAL_WIDTH, LOGICAL_HEIGHT)).toEqual({
            left: 0, right: 800, bottom: 600, top: 0,
        });
    });

    it('adds space at the sides of a wider viewport (16:9)', () => {
        const b = fitLogicalOrtho(1920, 1080, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        expect(b.top).toBe(0);
        expect(b.bottom).toBe(600);
        expect(b.left).toBeCloseTo(-(b.right - 800));
        expect(aspectOf(b)).toBeCloseTo(1920 / 1080);
    });

    it('works for 16:10', () => {
        const b = fitLogicalOrtho(1680, 1050, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        expect(b.left).toBeLessThan(0);
        expect(aspectOf(b)).toBeCloseTo(1680 / 1050);
    });

    it('adds space above and below a taller viewport (phone-like)', () => {
        const b = fitLogicalOrtho(390, 844, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        expect(b.left).toBe(0);
        expect(b.right).toBe(800);
        expect(b.top).toBeCloseTo(-(b.bottom - 600));
        expect(aspectOf(b)).toBeCloseTo(390 / 844);
    });
});
