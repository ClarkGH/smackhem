import { describe, it, expect } from 'vitest';
import { logicalRectToScissor, type ScissorRect } from './scissorRect';
import { fitLogicalOrtho, orthographic } from '../../../core/math/mathHelpers';
import type { Mat4 } from '../../../types/common';

// The scene's projection, as RenderSystem builds it: an 800 x 600 game area fitted to the viewport, y down
const sceneOrtho = (viewportWidth: number, viewportHeight: number): Mat4 => {
    const b = fitLogicalOrtho(viewportWidth, viewportHeight, 800, 600);
    return orthographic(b.left, b.right, b.bottom, b.top, 0.1, 100);
};

const scissor = (
    viewportWidth: number,
    viewportHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
): ScissorRect => {
    const out: ScissorRect = {
        x: -1, y: -1, width: -1, height: -1,
    };
    return logicalRectToScissor(sceneOrtho(viewportWidth, viewportHeight), x, y, width, height, viewportWidth, viewportHeight, out);
};

describe('logicalRectToScissor', () => {
    it('fills an exactly fitting viewport', () => {
        expect(scissor(800, 600, 0, 0, 800, 600)).toEqual({
            x: 0, y: 0, width: 800, height: 600,
        });
    });

    it('flips y: logical y runs down from the top, GL\'s scissor up from the bottom', () => {
        // 50 from the top and 100 tall leaves 450 below it
        expect(scissor(800, 600, 100, 50, 200, 100)).toEqual({
            x: 100, y: 450, width: 200, height: 100,
        });
    });

    it('lands inside the bars on a wider viewport', () => {
        // 1000 x 600: the game area keeps 800 wide, centered, with 100 of bezel either side
        expect(scissor(1000, 600, 0, 0, 800, 600)).toEqual({
            x: 100, y: 0, width: 800, height: 600,
        });
    });

    it('lands inside the bars on a taller viewport', () => {
        // 800 x 800: 100 of bezel above and below
        expect(scissor(800, 800, 0, 0, 800, 600)).toEqual({
            x: 0, y: 100, width: 800, height: 600,
        });
    });

    it('scales with the viewport', () => {
        expect(scissor(1600, 1200, 0, 0, 800, 600)).toEqual({
            x: 0, y: 0, width: 1600, height: 1200,
        });
    });

    it('lands on whole pixels when the scale doesn\'t divide evenly', () => {
        const rect = scissor(1001, 603, 0, 0, 800, 600);
        expect(Number.isInteger(rect.x)).toBe(true);
        expect(Number.isInteger(rect.y)).toBe(true);
        expect(Number.isInteger(rect.width)).toBe(true);
        expect(Number.isInteger(rect.height)).toBe(true);
    });

    it('writes into out and returns it, so a frame allocates nothing (M-1)', () => {
        const out: ScissorRect = {
            x: 0, y: 0, width: 0, height: 0,
        };
        expect(logicalRectToScissor(sceneOrtho(800, 600), 0, 0, 10, 10, 800, 600, out)).toBe(out);
    });
});
