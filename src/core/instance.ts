import { PlayerIntent } from 'src/services/input';
import { Vec3 } from 'src/types/common';
import { TypeSafeEventBus } from './events';
import type { GameMode, GameState } from './gameState';
import { lerpVec3, smoothstep } from './math/mathHelpers';
import {
    getCameraForward,
    getCameraRight,
    INSTANCE_CHARACTER_SIZE,
    PLAYER_SPEED,
    type Camera,
} from './camera';
import {
    updatePlayerAABB,
    checkCollision,
    resolveCollision,
    type CollisionContext,
} from './collision';
import { World } from './world';

const TRANSITION_DURATION = 1;

export default class Instance3DSystem {
    // PERFORMANCE: Pre-allocated fields isolated to this system context
    private readonly transitionStartPos: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly transitionEndPos: Vec3 = { x: 0, y: 0, z: 0 };

    constructor(
        // I assure you, these variables are in use
        // eslint-disable-next-line
        private collisionContext: CollisionContext,
        // eslint-disable-next-line
        private world: World,
        // eslint-disable-next-line
        private camera: Camera,
        // eslint-disable-next-line
        private eventBus: TypeSafeEventBus
    ) {
        console.log('2D Instance System Instantiated');
    }

    private isInstanceTransitionPositionBlocked(position: Vec3): boolean {
        updatePlayerAABB(
            position,
            INSTANCE_CHARACTER_SIZE,
            INSTANCE_CHARACTER_SIZE / 2,
            this.collisionContext.playerAABB,
        );

        const worldAABBs = this.world.getCollidableAABBs();
        for (let i = 0; i < worldAABBs.length; i += 1) {
            if (checkCollision(this.collisionContext.playerAABB, worldAABBs[i])) {
                return true;
            }
        }
        return false;
    }

    public propagateInstance(gameState: GameState): void {
        const discreteState = gameState.discrete;

        if (discreteState.gameMode !== 'world_3d') return;

        const interpolatedState = gameState.interpolated;

        discreteState.isTimeFrozen = true;
        discreteState.savedPitch = this.camera.pitch;
        discreteState.targetPitch = 0;
        discreteState.isTransitioningPitch = true;

        discreteState.instanceIsTransitioning = true;
        discreteState.instanceTransitionDirection = 1;
        interpolatedState.instanceTransitionProgress = 0.0;
        discreteState.instanceIsActive = false;

        this.calculateTransitionPositions(gameState);

        interpolatedState.instanceCharacterPosition.x = this.transitionStartPos.x;
        interpolatedState.instanceCharacterPosition.y = this.transitionStartPos.y;
        interpolatedState.instanceCharacterPosition.z = this.transitionStartPos.z;

        gameState.discrete.gameMode = 'instance_3d';
        this.publishModeChange(discreteState.gameMode, 'instance_3d');
    }

    public unPropagateInstance(gameState: GameState): void {
        const discreteState = gameState.discrete;
        const interpolatedState = gameState.interpolated;

        discreteState.instanceIsTransitioning = true;
        discreteState.instanceTransitionDirection = -1;
        interpolatedState.instanceTransitionProgress = 1.0;

        this.transitionEndPos.x = interpolatedState.instanceCharacterPosition.x;
        this.transitionEndPos.y = interpolatedState.instanceCharacterPosition.y;
        this.transitionEndPos.z = interpolatedState.instanceCharacterPosition.z;

        const circleSize = INSTANCE_CHARACTER_SIZE;
        const floorY = circleSize / 2;

        this.transitionStartPos.x = this.camera.position.x;
        this.transitionStartPos.y = floorY;
        this.transitionStartPos.z = this.camera.position.z;

        gameState.discrete.gameMode = 'world_3d';
        this.publishModeChange(discreteState.gameMode, 'world_3d');
    }

    private calculateTransitionPositions(gameState: GameState): void {
        const forward = getCameraForward(this.camera.yaw, gameState.discrete.targetPitch);
        const circleSize = INSTANCE_CHARACTER_SIZE;
        const floorY = circleSize / 2;

        this.transitionStartPos.x = this.camera.position.x;
        this.transitionStartPos.y = floorY;
        this.transitionStartPos.z = this.camera.position.z;

        const forwardDistance = 3.0;
        this.transitionEndPos.x = this.camera.position.x + forward.x * forwardDistance;
        this.transitionEndPos.y = floorY;
        this.transitionEndPos.z = this.camera.position.z + forward.z * forwardDistance;
    }

    public update(dt: number, gameState: GameState, intent: PlayerIntent): void {
        const discreteState = gameState.discrete;
        const interpolatedState = gameState.interpolated;

        if (discreteState.isTimeFrozen && discreteState.instanceIsTransitioning) {
            interpolatedState.instanceTransitionProgress += (
                dt * discreteState.instanceTransitionDirection
            ) / TRANSITION_DURATION;

            if (interpolatedState.instanceTransitionProgress >= 1.0) {
                interpolatedState.instanceTransitionProgress = 1.0;
            } else if (interpolatedState.instanceTransitionProgress <= 0.0) {
                interpolatedState.instanceTransitionProgress = 0.0;
            }

            const smoothT = smoothstep(interpolatedState.instanceTransitionProgress);
            lerpVec3(
                this.transitionStartPos,
                this.transitionEndPos,
                smoothT,
                interpolatedState.instanceCharacterPosition,
            );

            if (
                discreteState.instanceTransitionDirection > 0
                && this.isInstanceTransitionPositionBlocked(interpolatedState.instanceCharacterPosition)
            ) {
                discreteState.instanceTransitionDirection = -1;
                discreteState.instanceIsActive = false;
            }

            if (
                interpolatedState.instanceTransitionProgress >= 1.0
                && discreteState.instanceTransitionDirection > 0
            ) {
                discreteState.instanceIsTransitioning = false;
                discreteState.instanceIsActive = true;
            }

            if (interpolatedState.instanceTransitionProgress <= 0.0) {
                discreteState.instanceIsTransitioning = false;
                discreteState.instanceIsActive = false;
                discreteState.isTimeFrozen = false;
                discreteState.gameMode = 'world_3d';
                this.publishModeChange(discreteState.gameMode, 'world_3d');
            }
        }

        if (discreteState.isTimeFrozen && discreteState.isTransitioningPitch) {
            const pitchTransitionSpeed = 2.0;
            const pitchDelta = (discreteState.targetPitch - this.camera.pitch) * pitchTransitionSpeed * dt;

            if (Math.abs(pitchDelta) < 0.001) {
                this.camera.pitch = discreteState.targetPitch;
                interpolatedState.cameraPitch = discreteState.targetPitch;
                discreteState.isTransitioningPitch = false;
            } else {
                this.camera.pitch += pitchDelta;
                interpolatedState.cameraPitch = this.camera.pitch;
            }
        }

        if (discreteState.isTimeFrozen && discreteState.instanceIsActive && !discreteState.instanceIsTransitioning) {
            const { x: moveX, y: moveY } = intent.move;

            if (moveX !== 0 || moveY !== 0) {
                const forward = getCameraForward(this.camera.yaw, 0);
                const right = getCameraRight(this.camera.yaw);

                const moveDistance = PLAYER_SPEED * dt;
                const proposedMovement = {
                    x: (forward.x * moveY + right.x * moveX) * moveDistance,
                    y: 0,
                    z: (forward.z * moveY + right.z * moveX) * moveDistance,
                };

                const worldAABBs = this.world.getCollidableAABBs();
                const resolvedMovement = resolveCollision(
                    interpolatedState.instanceCharacterPosition,
                    proposedMovement,
                    worldAABBs,
                    INSTANCE_CHARACTER_SIZE,
                    INSTANCE_CHARACTER_SIZE / 2,
                    this.collisionContext,
                );

                interpolatedState.instanceCharacterPosition.x += resolvedMovement.x;
                interpolatedState.instanceCharacterPosition.z += resolvedMovement.z;
            }
        }
    }

    private publishModeChange(previousMode: GameMode, currentMode: GameMode): void {
        if (previousMode === currentMode) return;

        this.eventBus.publish({
            type: 'game_mode_changed',
            previousMode,
            currentMode,
        });
    }
}
