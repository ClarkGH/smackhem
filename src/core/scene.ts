import type { GameState } from './gameState';
import type { PlayerIntent } from '../services/input';
import type { TypeSafeEventBus } from './events';
import { PLAYER_SPEED } from './camera';

export const SCENE_TILE_SIZE = 32; // pixels per tile
const SCENE_GRID_WIDTH = 25; // 800px / 32px
const SCENE_GRID_HEIGHT = 18.75; // 600px / 32px
const SCENE_WIDTH_PX = SCENE_GRID_WIDTH * SCENE_TILE_SIZE; // matches canvas
const SCENE_HEIGHT_PX = Math.round(SCENE_GRID_HEIGHT * SCENE_TILE_SIZE); // matches canvas
const SCENE_TRANSITION_DURATION = 1.0; // seconds

interface Scene {
    collisionGrid: Uint8Array; // Currently a rounded 469 bytes, tile-based (0 = walkable, 1 = solid)
}

const createScene = (): Scene => {
    const gridSize = Math.round(SCENE_GRID_WIDTH * SCENE_GRID_HEIGHT);
    const collisionGrid = new Uint8Array(gridSize);
    // All tiles are walkable (0) by default

    return {
        collisionGrid,
    };
};

export class Scene2DSystem {
    public scene: Scene;

    // eslint-disable-next-line
    constructor(private eventBus: TypeSafeEventBus) { // I assure you, this variable is in use
        this.scene = createScene();
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

                this.publishModeChange(discreteState.gameMode, 'scene_2d');

                discreteState.sceneIsTransitioning = true;
                discreteState.sceneTransitionDirection = 1;
                interpolatedState.sceneTransitionProgress = 0.0;
                discreteState.sceneIsActive = false;
            } else if (discreteState.gameMode === 'scene_2d') {
                this.publishModeChange(discreteState.gameMode, 'world_3d');

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
            interpolatedState.sceneTransitionProgress += (dt * discreteState.sceneTransitionDirection) / SCENE_TRANSITION_DURATION;

            if (interpolatedState.sceneTransitionProgress >= 1.0) {
                interpolatedState.sceneTransitionProgress = 1.0;
                discreteState.sceneIsTransitioning = false;
                discreteState.sceneIsActive = true;
            } else if (interpolatedState.sceneTransitionProgress <= 0.0) {
                interpolatedState.sceneTransitionProgress = 0.0;
                discreteState.sceneIsTransitioning = false;
                discreteState.sceneIsActive = false;

                this.publishModeChange(discreteState.gameMode, 'world_3d');

                if (discreteState.savedCameraState) {
                    interpolatedState.cameraPosition = { ...discreteState.savedCameraState.position };
                    interpolatedState.cameraYaw = discreteState.savedCameraState.yaw;
                    interpolatedState.cameraPitch = discreteState.savedCameraState.pitch;
                    discreteState.savedCameraState = null;
                }
            }
        }

        if (discreteState.gameMode !== 'scene_2d' || discreteState.isPaused || discreteState.sceneIsTransitioning) return;

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

    private publishModeChange(previousMode: any, currentMode: any): void {
        if (previousMode === currentMode) return;

        this.eventBus.publish({
            type: 'game_mode_changed',
            previousMode,
            currentMode,
        });
    }
}
