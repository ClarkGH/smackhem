export interface SceneCharacter {
    positionGrid: { x: number; y: number }; // grid coordinates, 0-24, 0-18
    positionPx: { x: number; y: number }; // pixel coordinates for smooth movement, 0-799, 0-599
}

export const createSceneCharacter = (gridPos: { x: number; y: number }): SceneCharacter => {
    // Convert grid position to pixel position (center of tile)
    const positionPx = {
        x: gridPos.x * 32 + 16, // center of tile
        y: gridPos.y * 32 + 16, // center of tile
    };

    return {
        positionGrid: { ...gridPos },
        positionPx,
    };
};
