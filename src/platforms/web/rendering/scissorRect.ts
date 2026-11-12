import type { Mat4 } from '../../../types/common';
import { projectPointInto } from '../../../core/math/mathHelpers';

// A rect in whole pixels, as gl.scissor takes it: x, y from the bottom-left corner
export interface ScissorRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Each corner's NDC, reused every call (M-1)
const cornerA = { x: 0, y: 0 };
const cornerB = { x: 0, y: 0 };

// NDC (-1..1) to the nearest whole pixel along an axis of `size` pixels
const ndcToPixel = (ndc: number, size: number): number => Math.round(((ndc + 1) / 2) * size);

/**
 * Where a rect in the caller's units (under viewProj) lands on the viewport, written into out (no allocation).
 * viewProj must be orthographic (axis-aligned, w = 1), like the scene's: under a perspective projection
 * a corner can sit behind the camera and the rect comes out mirrored or NaN.
 * Two opposite corners go through viewProj to NDC, then to pixels. Whichever way the projection
 * points y, min/max picks the right edges, and GL's bottom-left origin falls out of NDC's y-up.
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
    // z is 0: a scissor has no depth
    projectPointInto(viewProj, x, y, 0, cornerA);
    projectPointInto(viewProj, x + width, y + height, 0, cornerB);
    const x0 = ndcToPixel(cornerA.x, viewportWidth);
    const x1 = ndcToPixel(cornerB.x, viewportWidth);
    const y0 = ndcToPixel(cornerA.y, viewportHeight);
    const y1 = ndcToPixel(cornerB.y, viewportHeight);

    // + 0 turns -0 (a tiny negative, rounded) into 0, like fitLogicalOrtho's 0 - pad
    out.x = Math.min(x0, x1) + 0;
    out.y = Math.min(y0, y1) + 0;
    out.width = Math.abs(x1 - x0);
    out.height = Math.abs(y1 - y0);
    return out;
};
