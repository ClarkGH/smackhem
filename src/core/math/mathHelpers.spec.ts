import { describe, it, expect } from 'vitest';
import {
    createTranslationMatrix,
    fitLogicalOrtho,
    identity,
    lerpVec3,
    lookDirection,
    lookDirectionInto,
    matrixMultiply,
    matrixMultiplyInto,
    orthographic,
    perspective,
    perspectiveInto,
    projectPointInto,
    quaternionApplyToVector,
    quaternionFromAxisAngle,
    quaternionFromYawPitch,
    quaternionIdentity,
    quaternionMultiply,
    quaternionNormalize,
    smoothstep,
} from './mathHelpers';
import type { Mat4, Vec3 } from '../../types/common';

const newMat4 = (): Mat4 => ({ elements: new Float32Array(16) });

const expectVecClose = (actual: Vec3, expected: Vec3): void => {
    expect(actual.x).toBeCloseTo(expected.x, 5);
    expect(actual.y).toBeCloseTo(expected.y, 5);
    expect(actual.z).toBeCloseTo(expected.z, 5);
};

// Where a point lands through an affine matrix (w stays 1), all three coordinates
const transformPoint = (m: Mat4, p: Vec3): Vec3 => {
    const e = m.elements;
    return {
        x: e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12],
        y: e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13],
        z: e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14],
    };
};

const Y_AXIS = { x: 0, y: 1, z: 0 };

describe('identity', () => {
    it('has ones down the diagonal and zeros elsewhere', () => {
        expect(Array.from(identity().elements)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });
});

describe('createTranslationMatrix', () => {
    it('moves a point by x, y, z and changes nothing else', () => {
        const m = createTranslationMatrix(3, -2, 5);

        expectVecClose(transformPoint(m, { x: 1, y: 1, z: 1 }), { x: 4, y: -1, z: 6 });
        expect(Array.from(m.elements)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, -2, 5, 1]);
    });
});

describe('orthographic', () => {
    // The y-down logical area fitLogicalOrtho gives at 4:3: top is 0, bottom is 600
    const m = orthographic(0, 800, 600, 0, 0.1, 100);

    it('maps the left/top corner to (-1, 1) and the right/bottom corner to (1, -1)', () => {
        expectVecClose(transformPoint(m, { x: 0, y: 0, z: -0.1 }), { x: -1, y: 1, z: -1 });
        expectVecClose(transformPoint(m, { x: 800, y: 600, z: -100 }), { x: 1, y: -1, z: 1 });
    });

    it('maps the middle to the center, half way through the depth range', () => {
        expectVecClose(transformPoint(m, { x: 400, y: 300, z: -50.05 }), { x: 0, y: 0, z: 0 });
    });
});

describe('matrixMultiply', () => {
    // Translation then ortho don't commute, so these show the order
    const ortho = orthographic(0, 800, 600, 0, 0.1, 100);
    const move = createTranslationMatrix(100, 50, 0);

    it('leaves a matrix unchanged times identity, either side', () => {
        expect(Array.from(matrixMultiply(identity(), ortho).elements)).toEqual(Array.from(ortho.elements));
        expect(Array.from(matrixMultiply(ortho, identity()).elements)).toEqual(Array.from(ortho.elements));
    });

    it('applies the right hand matrix first: (a x b) p is a (b p)', () => {
        const p = { x: 200, y: 100, z: -1 };

        expectVecClose(transformPoint(matrixMultiply(ortho, move), p), transformPoint(ortho, transformPoint(move, p)));
        // The other order moves after projecting, which lands somewhere else
        expect(transformPoint(matrixMultiply(move, ortho), p).x).not.toBeCloseTo(transformPoint(matrixMultiply(ortho, move), p).x);
    });

    it('adds translations', () => {
        const both = matrixMultiply(createTranslationMatrix(1, 2, 3), createTranslationMatrix(10, 20, 30));

        expectVecClose(transformPoint(both, { x: 0, y: 0, z: 0 }), { x: 11, y: 22, z: 33 });
    });
});

describe('matrixMultiplyInto', () => {
    it('matches matrixMultiply, and leaves nothing behind in a reused matrix', () => {
        const a = orthographic(0, 800, 600, 0, 0.1, 100);
        const b = lookDirection({ x: 3, y: 1.6, z: -7 }, 0.7, 0.3);
        const out = newMat4();
        out.elements.fill(9);

        matrixMultiplyInto(a, b, out);

        expect(Array.from(out.elements)).toEqual(Array.from(matrixMultiply(a, b).elements));
    });
});

describe('lookDirection', () => {
    it('matches lookDirectionInto, in a new matrix each call', () => {
        const position = { x: 3, y: 1.6, z: -7 };
        const first = lookDirection(position, 0.7, 0.3);

        expect(Array.from(first.elements)).toEqual(Array.from(lookDirectionInto(position, 0.7, 0.3, newMat4()).elements));
        expect(lookDirection(position, 0.7, 0.3)).not.toBe(first);
    });
});

describe('quaternions', () => {
    it('leaves a vector alone under the identity', () => {
        expectVecClose(quaternionApplyToVector(quaternionIdentity(), { x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
    });

    it('turns +x to -z a quarter turn about y (right handed)', () => {
        const q = quaternionFromAxisAngle(Y_AXIS, Math.PI / 2);

        expectVecClose(quaternionApplyToVector(q, { x: 1, y: 0, z: 0 }), { x: 0, y: 0, z: -1 });
        // The axis itself doesn't move
        expectVecClose(quaternionApplyToVector(q, Y_AXIS), Y_AXIS);
    });

    it('keeps a vector the same length', () => {
        const q = quaternionFromAxisAngle({ x: 0.6, y: 0, z: 0.8 }, 1.1);
        const v = quaternionApplyToVector(q, { x: 1, y: 2, z: 2 });

        expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(3, 5);
    });

    it('adds angles about the same axis when multiplied', () => {
        const eighth = quaternionFromAxisAngle(Y_AXIS, Math.PI / 4);
        const quarter = quaternionMultiply(eighth, eighth);

        expectVecClose(quaternionApplyToVector(quarter, { x: 1, y: 0, z: 0 }), { x: 0, y: 0, z: -1 });
    });

    it('applies the right hand rotation first when multiplied', () => {
        // a x b: b first. Pitch +x up a quarter about z, then yaw it about y: it stays straight up
        const yaw = quaternionFromAxisAngle(Y_AXIS, Math.PI / 2);
        const pitch = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);

        expectVecClose(quaternionApplyToVector(quaternionMultiply(yaw, pitch), { x: 1, y: 0, z: 0 }), Y_AXIS);
    });

    it('normalizes to unit length, and gives the identity for a zero quaternion', () => {
        const q = quaternionNormalize({
            x: 0, y: 3, z: 0, w: 4,
        });
        const zero = {
            x: 0, y: 0, z: 0, w: 0,
        };

        expect(q).toEqual({
            x: 0, y: 0.6, z: 0, w: 0.8,
        });
        expect(quaternionNormalize(zero)).toEqual(quaternionIdentity());
    });

    it('looks along +x at a quarter turn of yaw, and up at a positive pitch', () => {
        const forward = { x: 0, y: 0, z: -1 };

        expectVecClose(quaternionApplyToVector(quaternionFromYawPitch(Math.PI / 2, 0), forward), { x: 1, y: 0, z: 0 });
        expect(quaternionApplyToVector(quaternionFromYawPitch(0, 0.5), forward).y).toBeGreaterThan(0);
    });
});

describe('smoothstep', () => {
    it('clamps outside 0..1', () => {
        expect(smoothstep(-1)).toBe(0);
        expect(smoothstep(2)).toBe(1);
    });

    it('starts slow, passes the middle at 0.5, and mirrors around it', () => {
        expect(smoothstep(0.5)).toBe(0.5);
        expect(smoothstep(0.25)).toBeCloseTo(0.15625);
        expect(smoothstep(0.25)).toBeLessThan(0.25);
        expect(smoothstep(0.75)).toBeCloseTo(1 - smoothstep(0.25));
    });
});

describe('lerpVec3', () => {
    const a = { x: 0, y: 10, z: -4 };
    const b = { x: 2, y: 20, z: 4 };

    it('gives a at 0, b at 1, and the middle at 0.5', () => {
        const out = { x: 0, y: 0, z: 0 };

        lerpVec3(a, b, 0, out);
        expect(out).toEqual(a);
        lerpVec3(a, b, 1, out);
        expect(out).toEqual(b);
        lerpVec3(a, b, 0.5, out);
        expect(out).toEqual({ x: 1, y: 15, z: 0 });
    });

    it('can write back into a', () => {
        const from = { ...a };

        lerpVec3(from, b, 0.5, from);
        expect(from).toEqual({ x: 1, y: 15, z: 0 });
    });
});

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

describe('projectPointInto', () => {
    it('maps an 800 x 600, y-down area onto NDC, with w 1', () => {
        // Written out by hand (column-major), so it doesn't lean on orthographic():
        // x: 0..800 -> -1..1, y: 0..600 -> 1..-1
        const m = newMat4();
        m.elements[0] = 2 / 800; m.elements[12] = -1;
        m.elements[5] = -2 / 600; m.elements[13] = 1;
        m.elements[10] = 1; m.elements[15] = 1;
        const out = { x: 0, y: 0 };

        expect(projectPointInto(m, 0, 0, 0, out)).toBe(1);
        expect(out).toEqual({ x: -1, y: 1 });
        projectPointInto(m, 800, 600, 0, out);
        expect(out.x).toBeCloseTo(1, 6);
        expect(out.y).toBeCloseTo(-1, 6);
        projectPointInto(m, 200, 450, 0, out);
        expect(out.x).toBeCloseTo(-0.5, 6);
        expect(out.y).toBeCloseTo(-0.5, 6);
    });

    it('divides by w under a perspective projection, and gives w <= 0 behind the camera', () => {
        // 90 degree fov, square: a point at depth 1 projects to its own x, y
        const m = perspectiveInto(Math.PI / 2, 1, 0.1, 100, newMat4());
        const out = { x: 0, y: 0 };

        expect(projectPointInto(m, 0.5, -0.25, -1, out)).toBeCloseTo(1, 6);
        expect(out.x).toBeCloseTo(0.5, 6);
        expect(out.y).toBeCloseTo(-0.25, 6);
        // Twice as far: half as far from the center
        projectPointInto(m, 0.5, -0.25, -2, out);
        expect(out.x).toBeCloseTo(0.25, 6);
        expect(out.y).toBeCloseTo(-0.125, 6);

        expect(projectPointInto(m, 0, 0, 1, out)).toBeLessThan(0);
    });
});
