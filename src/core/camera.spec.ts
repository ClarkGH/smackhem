import { describe, it, expect } from 'vitest';
import {
    createCamera,
    flatForwardInto,
    flatRightInto,
    getCameraForward,
    getCameraMatrix,
    getCameraMatrixInto,
    getCameraRight,
} from './camera';
import type { Mat4 } from '../types/common';

const newMat4 = (): Mat4 => ({ elements: new Float32Array(16) });

// Every quadrant, both quarter turns, and the start
const YAWS = [0, 0.7, Math.PI / 2, 2.5, Math.PI, -1.2];

describe('flat move directions', () => {
    it('flatForwardInto matches getCameraForward, without allocating a new vector', () => {
        const out = { x: 0, y: 0, z: 0 };
        YAWS.forEach((yaw) => {
            const expected = getCameraForward(yaw, 0);
            expect(flatForwardInto(yaw, out)).toBe(out);
            expect(out.x).toBeCloseTo(expected.x, 6);
            expect(out.z).toBeCloseTo(expected.z, 6);
        });
    });

    it('flatRightInto matches getCameraRight, without allocating a new vector', () => {
        const out = { x: 0, y: 0, z: 0 };
        YAWS.forEach((yaw) => {
            const expected = getCameraRight(yaw);
            expect(flatRightInto(yaw, out)).toBe(out);
            expect(out.x).toBeCloseTo(expected.x, 6);
            expect(out.z).toBeCloseTo(expected.z, 6);
        });
    });

    it('flattens a tilted forward the same way movement always has', () => {
        // Movement used getCameraForward(yaw, pitch), which drops the tilt and rescales to length 1
        const out = { x: 0, y: 0, z: 0 };
        YAWS.forEach((yaw) => {
            const expected = getCameraForward(yaw, 1.2);
            flatForwardInto(yaw, out);
            expect(out.x).toBeCloseTo(expected.x, 5);
            expect(out.z).toBeCloseTo(expected.z, 5);
        });
    });
});

describe('getCameraMatrixInto', () => {
    it('matches getCameraMatrix, reusing the same matrices from one camera to the next', () => {
        const out = newMat4();
        const scratch = { proj: newMat4(), view: newMat4() };
        const camera = createCamera();

        [[0, 0, 0, 0], [3, 1.6, -7, 0.7], [-12, 2, 40, -2.4]].forEach(([x, y, z, yaw]) => {
            camera.position = { x, y, z };
            camera.yaw = yaw;
            camera.pitch = yaw / 4;

            expect(getCameraMatrixInto(camera, 16 / 9, out, scratch)).toBe(out);
            const expected = getCameraMatrix(camera, 16 / 9).elements;
            for (let i = 0; i < 16; i += 1) expect(out.elements[i]).toBeCloseTo(expected[i], 5);
        });
    });
});
