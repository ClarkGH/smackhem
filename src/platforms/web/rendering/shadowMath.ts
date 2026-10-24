import type { Mat4, Vec3 } from '../../../types/common';

/**
 * View-projection for a directional shadow map, written into out (no allocation).
 * Orthographic, looking along -direction (direction is surface -> light, unit length).
 * Covers a square halfExtent either side of focus, and depthRadius either side of it along the light.
 * The centre snaps to whole texels: without that, every small camera move re-rasterises
 * shadow edges at slightly different spots and they crawl ("shimmer").
 */
export const computeLightViewProj = (
    direction: Vec3,
    focus: Vec3,
    halfExtent: number,
    depthRadius: number,
    mapSize: number,
    out: Mat4,
): void => {
    const d = direction;

    // Light-space right = up x d, with any up that isn't parallel to d
    const upY = Math.abs(d.y) > 0.99 ? 0 : 1;
    const upZ = 1 - upY;
    let sx = upY * d.z - upZ * d.y;
    let sy = upZ * d.x;
    let sz = -upY * d.x;
    const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
    sx /= sLen; sy /= sLen; sz /= sLen;

    // Light-space up = d x right, already unit length
    const ux = d.y * sz - d.z * sy;
    const uy = d.z * sx - d.x * sz;
    const uz = d.x * sy - d.y * sx;

    const texel = (2 * halfExtent) / mapSize;
    const centreS = Math.round((sx * focus.x + sy * focus.y + sz * focus.z) / texel) * texel;
    const centreU = Math.round((ux * focus.x + uy * focus.y + uz * focus.z) / texel) * texel;
    const centreD = d.x * focus.x + d.y * focus.y + d.z * focus.z;

    // Rows: right / halfExtent, up / halfExtent, and depth -d / depthRadius
    // (nearer the light is smaller depth). Column-major, as WebGL reads it.
    const o = out.elements;
    o[0] = sx / halfExtent; o[4] = sy / halfExtent; o[8] = sz / halfExtent; o[12] = -centreS / halfExtent;
    o[1] = ux / halfExtent; o[5] = uy / halfExtent; o[9] = uz / halfExtent; o[13] = -centreU / halfExtent;
    o[2] = -d.x / depthRadius; o[6] = -d.y / depthRadius; o[10] = -d.z / depthRadius; o[14] = centreD / depthRadius;
    o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
};

export default computeLightViewProj;
