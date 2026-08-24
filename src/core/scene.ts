export const SCENE_TILE_SIZE = 32; // pixels per tile
export const SCENE_GRID_WIDTH = 25; // 800px / 32px
export const SCENE_GRID_HEIGHT = 19; // 600px / 32px
export const SCENE_WIDTH_PX = 800; // matches canvas
export const SCENE_HEIGHT_PX = 600; // matches canvas
export const SCENE_TRANSITION_DURATION = 1.0; // seconds

export interface Scene {
    isActive: boolean;
    isTransitioning: boolean;
    transitionProgress: number; // 0.0 to 1.0
    transitionDirection: number; // 1.0 forward, -1.0 reverse
    isPaused: boolean; // scene-specific pause
    collisionGrid: Uint8Array; // 25x19 = 475 bytes, tile-based (0 = walkable, 1 = solid)
}

export const createScene = (): Scene => {
    // Initialize collision grid (all walkable by default)
    const gridSize = SCENE_GRID_WIDTH * SCENE_GRID_HEIGHT;
    const collisionGrid = new Uint8Array(gridSize);
    // All tiles are walkable (0) by default

    return {
        isActive: false,
        isTransitioning: false,
        transitionProgress: 0.0,
        transitionDirection: 1.0,
        isPaused: false,
        collisionGrid,
    };
};



