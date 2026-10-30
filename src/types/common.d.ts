declare global {
    var __PLATFORM__: string | undefined;
}

export interface Mat4 {
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
