import { describe, it, expect } from 'vitest';
import {
    createCamera,
    flatForwardInto,
    flatRightInto,
    getCameraMatrix,
    getCameraMatrixInto,
} from './camera';
import { quaternionApplyToVector, quaternionFromYawPitch } from './math/mathHelpers';
import type { Mat4, Vec3 } from '../types/common';

const newMat4 = (): Mat4 => ({ elements: new Float32Array(16) });

// Oracles: the flat directions worked out the long way, through the camera's quaternion rotation.
// The engine's own helpers are the trig shortcuts below them, which write into a vector instead of allocating.
const quaternionForward = (yaw: number, pitch: number): Vec3 => {
    const forward = quaternionApplyToVector(quaternionFromYawPitch(yaw, pitch), { x: 0, y: 0, z: -1 });
    // Drop the tilt and rescale to length 1
    const len = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
    return { x: forward.x / len, y: 0, z: forward.z / len };
};

const quaternionRight = (yaw: number): Vec3 => quaternionForward(yaw + Math.PI / 2, 0);

// Every quadrant, both quarter turns, and the start
const YAWS = [0, 0.7, Math.PI / 2, 2.5, Math.PI, -1.2];

describe('flat move directions', () => {
    it('flatForwardInto matches the quaternion forward, without allocating a new vector', () => {
        const out = { x: 0, y: 0, z: 0 };
        YAWS.forEach((yaw) => {
            const expected = quaternionForward(yaw, 0);
            expect(flatForwardInto(yaw, out)).toBe(out);
            expect(out.x).toBeCloseTo(expected.x, 6);
            expect(out.z).toBeCloseTo(expected.z, 6);
        });
    });

    it('flatRightInto matches the quaternion right, without allocating a new vector', () => {
        const out = { x: 0, y: 0, z: 0 };
        YAWS.forEach((yaw) => {
            const expected = quaternionRight(yaw);
            expect(flatRightInto(yaw, out)).toBe(out);
            expect(out.x).toBeCloseTo(expected.x, 6);
            expect(out.z).toBeCloseTo(expected.z, 6);
        });
    });

    it('flattens a tilted forward the same way movement always has', () => {
        // Movement and the instance's opening once used the quaternion forward with the camera's pitch
        const out = { x: 0, y: 0, z: 0 };
        YAWS.forEach((yaw) => {
            const expected = quaternionForward(yaw, 1.2);
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
