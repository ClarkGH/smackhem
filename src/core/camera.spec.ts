import { describe, it, expect } from 'vitest';
import { createCamera, getCameraMatrix, getCameraMatrixInto } from './camera';
import type { Mat4 } from '../types/common';

const newMat4 = (): Mat4 => ({ elements: new Float32Array(16) });

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
