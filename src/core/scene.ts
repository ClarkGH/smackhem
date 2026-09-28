export const SCENE_TILE_SIZE = 32; // pixels per tile
export const SCENE_GRID_WIDTH = 25; // 800px / 32px
export const SCENE_GRID_HEIGHT = 18.75; // 600px / 32px
export const SCENE_WIDTH_PX = SCENE_GRID_WIDTH * SCENE_TILE_SIZE; // matches canvas
export const SCENE_HEIGHT_PX = Math.round(SCENE_GRID_HEIGHT * SCENE_TILE_SIZE); // matches canvas
export const SCENE_TRANSITION_DURATION = 1.0; // seconds

export interface Scene {
    collisionGrid: Uint8Array; // 25x18.75 = 469 bytes, tile-based (0 = walkable, 1 = solid)
}

export const createScene = (): Scene => {
    // Initialize collision grid (all walkable by default)
    const gridSize = SCENE_GRID_WIDTH * SCENE_GRID_HEIGHT;
    const collisionGrid = new Uint8Array(gridSize);
    // All tiles are walkable (0) by default

    return {
        collisionGrid,
    };
};
