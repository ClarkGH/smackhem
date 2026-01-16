import type { Vec3 } from '../types/common';

export interface InstanceState {
    isActive: boolean;
    characterPosition: Vec3; // On floor plane (Y=0)
    transitionProgress: number; // 0.0 to 1.0 (fixed timestep accumulated)
    isTransitioning: boolean;
    transitionDirection: number; // 1.0 for forward, -1.0 for reverse
}

export const TRANSITION_DURATION = 1.0; // 1.0 second in simulation time

export const createInstanceState = (): InstanceState => ({
    isActive: false,
    characterPosition: { x: 0, y: 0, z: 0 },
    transitionProgress: 0.0,
    isTransitioning: false,
    transitionDirection: 1.0,
});

/**
 * Smoothstep interpolation function
 * Returns value between 0 and 1 with smooth ease-in-out curve
 */
export const smoothstep = (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
};

/**
 * Linear interpolation between two Vec3 values
 * Writes result into out object (zero-allocation)
 */
export const lerpVec3 = (a: Vec3, b: Vec3, t: number, out: Vec3): void => {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
};
