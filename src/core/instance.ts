/**
 * Instance system manages the 2D instance mode where party members,
 * NPCs, and enemies are displayed as 2D sprites in a frozen 3D scene.
 */

export interface Instance {
    isActive: boolean;
    isTransitioning: boolean;
    transitionProgress: number; // 0.0 to 1.0 (fixed timestep accumulated)
    transitionDirection: number; // 1.0 for forward (entering), -1.0 for reverse (exiting)
}

export const TRANSITION_DURATION = 1.0; // 1.0 second in simulation time

export const createInstance = (): Instance => ({
    isActive: false,
    isTransitioning: false,
    transitionProgress: 0.0,
    transitionDirection: 1.0,
});
