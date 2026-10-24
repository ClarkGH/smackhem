import type { GameMode, GameState } from './gameState';
import type { PlayerIntent } from '../services/input';
import type { TypeSafeEventBus } from './events';
import { PLAYER_SPEED } from './camera';
import type { Settings } from './settings/settings';

// The 2D scene lives in a fixed logical space (units, not screen pixels).
// The renderer fits it to any viewport, centered and undistorted.
export const SCENE_TILE_SIZE = 32; // logical units per tile
const SCENE_GRID_WIDTH = 25; // 800 / 32
const SCENE_GRID_HEIGHT = 18.75; // 600 / 32
export const SCENE_WIDTH_PX = SCENE_GRID_WIDTH * SCENE_TILE_SIZE; // 800 logical units
export const SCENE_HEIGHT_PX = Math.round(SCENE_GRID_HEIGHT * SCENE_TILE_SIZE); // 600 logical units
const SCENE_TRANSITION_DURATION = 1.0; // seconds

interface Scene {
    collisionGrid: Uint8Array; // Currently a rounded 469 bytes, tile-based (0 = walkable, 1 = solid)
}

export class Scene2DSystem {
    public scene: Scene;

    constructor(private eventBus: TypeSafeEventBus, private settings: Settings) { // I assure you, these variables are in use
        this.scene = this.createScene();
    }

    public update(dt: number, gameState: GameState, intent: PlayerIntent): void {
        const discreteState = gameState.discrete;
        const interpolatedState = gameState.interpolated;

        // Scene entry/exit
        if (intent.interact) {
            if (discreteState.gameMode === 'world_3d') {
                discreteState.savedCameraState = {
                    position: { ...interpolatedState.cameraPosition },
                    yaw: interpolatedState.cameraYaw,
                    pitch: interpolatedState.cameraPitch,
                };
                discreteState.targetPitch = 0;
                discreteState.isTransitioningPitch = true;
                const previousMode = discreteState.gameMode;
                discreteState.gameMode = 'scene_2d';

                this.publishModeChange(previousMode, 'scene_2d');

                discreteState.sceneIsTransitioning = true;
                discreteState.sceneTransitionDirection = 1;
                interpolatedState.sceneTransitionProgress = 0.0;
                discreteState.sceneIsActive = false;
            } else if (discreteState.gameMode === 'scene_2d') {
                const previousMode = discreteState.gameMode;
                discreteState.gameMode = 'world_3d';
                this.publishModeChange(previousMode, 'world_3d');

                discreteState.sceneIsActive = false;
                discreteState.sceneIsTransitioning = false;
                interpolatedState.sceneTransitionProgress = 0.0;
                discreteState.isTransitioningPitch = false;

                if (discreteState.savedCameraState) {
                    interpolatedState.cameraPosition = { ...discreteState.savedCameraState.position };
                    interpolatedState.cameraYaw = discreteState.savedCameraState.yaw;
                    interpolatedState.cameraPitch = discreteState.savedCameraState.pitch;
                    discreteState.savedCameraState = null;
                }
            }
        }

        if (discreteState.gameMode === 'scene_2d' && discreteState.sceneIsTransitioning) {
            // Reduced motion: the whole transition in one tick
            const duration = this.settings.reducedMotion ? dt : SCENE_TRANSITION_DURATION;
            interpolatedState.sceneTransitionProgress += (dt * discreteState.sceneTransitionDirection) / duration;

            if (interpolatedState.sceneTransitionProgress >= 1.0) {
                interpolatedState.sceneTransitionProgress = 1.0;
                discreteState.sceneIsTransitioning = false;
                discreteState.sceneIsActive = true;
            }
        }

        if (discreteState.gameMode !== 'scene_2d' || discreteState.isTimeFrozen || discreteState.sceneIsTransitioning) return;

        const { x: moveX, y: moveY } = intent.move;

        if (moveX !== 0 || moveY !== 0) {
            // TODO: Figure out 2D scene movement speed constants or a new equation
            const moveSpeed = PLAYER_SPEED * dt + 1;
            const newPxX = interpolatedState.sceneCharacterPositionPx.x + moveX * moveSpeed;
            const newPxY = interpolatedState.sceneCharacterPositionPx.y - moveY * moveSpeed;

            const gridX = Math.floor(newPxX / SCENE_TILE_SIZE);
            const gridY = Math.floor(newPxY / SCENE_TILE_SIZE);

            if (gridX >= 0 && gridX < SCENE_GRID_WIDTH && gridY >= 0 && gridY < SCENE_GRID_HEIGHT) {
                const gridIndex = gridY * SCENE_GRID_WIDTH + gridX;
                const isWalkable = this.scene.collisionGrid[gridIndex] === 0;

                if (isWalkable) {
                    interpolatedState.sceneCharacterPositionPx.x = newPxX;
                    interpolatedState.sceneCharacterPositionPx.y = newPxY;
                    discreteState.sceneCharacterPositionGrid.x = gridX;
                    discreteState.sceneCharacterPositionGrid.y = gridY;
                }
            }

            interpolatedState.sceneCharacterPositionPx.x = Math.max(0, Math.min(SCENE_WIDTH_PX - 1, interpolatedState.sceneCharacterPositionPx.x));
            interpolatedState.sceneCharacterPositionPx.y = Math.max(0, Math.min(SCENE_HEIGHT_PX - 1, interpolatedState.sceneCharacterPositionPx.y));
        }
    }

    private createScene = (): Scene => {
        const gridSize = Math.round(SCENE_GRID_WIDTH * SCENE_GRID_HEIGHT);
        const collisionGrid = new Uint8Array(gridSize);
        // All tiles are walkable (0) by default

        return {
            collisionGrid,
        };
    };

    private publishModeChange(previousMode: GameMode, currentMode: GameMode): void {
        if (previousMode === currentMode) return;

        this.eventBus.publish({
            type: 'game_mode_changed',
            previousMode,
            currentMode,
        });
    }
}
