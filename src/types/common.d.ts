import type { Chunk } from '../core/world';

// Global defined by vite config via define
declare global {
    // 'var' is required for global declarations in TypeScript .d.ts files
    // vars-on-top doesn't apply to type declaration files
    // eslint-disable-next-line no-var, vars-on-top, no-unused-vars
    var __PLATFORM__: string | undefined;
}

export interface MapData {
    id: string;
    chunks: Chunk[];
    // ... other map properties
}

export interface Mat4 {
    // Placeholder 4x4 matrix type
    elements: Float32Array;
}

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}
