import type { Mat4 } from '../../../types/common';

// A rect in whole pixels, as gl.scissor takes it: x, y from the bottom-left corner
export interface ScissorRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Where a rect in the caller's units (under viewProj) lands on the viewport, written into out (no allocation).
 * Two opposite corners go through viewProj to clip space, then to pixels. Whichever way the projection
 * points y, min/max picks the right edges, and GL's bottom-left origin falls out of clip space's y-up.
 * Edges round to the nearest pixel, so two rects that share an edge still share it on screen.
 */
export const logicalRectToScissor = (
    viewProj: Mat4,
    x: number,
    y: number,
    width: number,
    height: number,
    viewportWidth: number,
    viewportHeight: number,
    out: ScissorRect,
): ScissorRect => {
    // Column-major, like every Mat4 here. z is 0: a scissor has no depth
    const m = viewProj.elements;
    const right = x + width;
    const bottom = y + height;

    const w0 = m[3] * x + m[7] * y + m[15];
    const w1 = m[3] * right + m[7] * bottom + m[15];
    const x0 = Math.round((((m[0] * x + m[4] * y + m[12]) / w0 + 1) / 2) * viewportWidth);
    const x1 = Math.round((((m[0] * right + m[4] * bottom + m[12]) / w1 + 1) / 2) * viewportWidth);
    const y0 = Math.round((((m[1] * x + m[5] * y + m[13]) / w0 + 1) / 2) * viewportHeight);
    const y1 = Math.round((((m[1] * right + m[5] * bottom + m[13]) / w1 + 1) / 2) * viewportHeight);

    // + 0 turns -0 (a tiny negative, rounded) into 0, like fitLogicalOrtho's 0 - pad
    out.x = Math.min(x0, x1) + 0;
    out.y = Math.min(y0, y1) + 0;
    out.width = Math.abs(x1 - x0);
    out.height = Math.abs(y1 - y0);
    return out;
};
