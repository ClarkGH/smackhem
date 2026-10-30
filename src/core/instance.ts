import type { PlayerIntent } from '../services/input';
import type { Vec3 } from '../types/common';
import { TypeSafeEventBus } from './events';
import type { GameMode, GameState } from './gameState';
import { lerpVec3, smoothstep } from './math/mathHelpers';
import {
    flatForwardInto,
    flatRightInto,
    getCameraForward,
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
import type { Settings } from './settings/settings';

const TRANSITION_DURATION = 1;

export default class Instance3DSystem {
    // PERFORMANCE: Pre-allocated fields isolated to this system context
    private readonly transitionStartPos: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly transitionEndPos: Vec3 = { x: 0, y: 0, z: 0 };

    // Filled in place on every tick the circle moves (M-1)
    private readonly moveForward: Vec3 = { x: 0, y: 0, z: -1 };

    private readonly moveRight: Vec3 = { x: 1, y: 0, z: 0 };

    private readonly proposedMovement: Vec3 = { x: 0, y: 0, z: 0 };

    constructor(
        // Parameter properties: each becomes a private field, e.g. this.world
        // TODO: declare the fields explicitly, as GameLoop does, in a later refactor
        private collisionContext: CollisionContext,
        private world: World,
        private camera: Camera,
        private eventBus: TypeSafeEventBus,
        private settings: Settings,
    ) {}

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

        discreteState.instanceIsOpen = true;
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

        const previousMode = discreteState.gameMode;
        // Writes shared state on purpose
        gameState.discrete.gameMode = 'instance_3d';
        this.publishModeChange(previousMode, 'instance_3d');
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

        // Mode stays instance_3d until the exit transition finishes in update()
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

        if (discreteState.instanceIsOpen && discreteState.instanceIsTransitioning) {
            // Reduced motion: the whole transition in one tick
            const duration = this.settings.reducedMotion ? dt : TRANSITION_DURATION;
            interpolatedState.instanceTransitionProgress += (
                dt * discreteState.instanceTransitionDirection
            ) / duration;

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
                discreteState.instanceIsOpen = false;
                const previousMode = discreteState.gameMode;
                discreteState.gameMode = 'world_3d';
                this.publishModeChange(previousMode, 'world_3d');
            }
        }

        if (discreteState.instanceIsOpen && discreteState.isTransitioningPitch) {
            const pitchTransitionSpeed = 2.0;
            const pitchDelta = (discreteState.targetPitch - this.camera.pitch) * pitchTransitionSpeed * dt;

            // Reduced motion levels the camera at once instead of easing
            if (Math.abs(pitchDelta) < 0.001 || this.settings.reducedMotion) {
                this.camera.pitch = discreteState.targetPitch;
                interpolatedState.cameraPitch = discreteState.targetPitch;
                discreteState.isTransitioningPitch = false;
            } else {
                this.camera.pitch += pitchDelta;
                interpolatedState.cameraPitch = this.camera.pitch;
            }
        }

        if (discreteState.instanceIsOpen && discreteState.instanceIsActive && !discreteState.instanceIsTransitioning) {
            const { x: moveX, y: moveY } = intent.move;

            if (moveX !== 0 || moveY !== 0) {
                const forward = flatForwardInto(this.camera.yaw, this.moveForward);
                const right = flatRightInto(this.camera.yaw, this.moveRight);

                const moveDistance = PLAYER_SPEED * dt;
                const { proposedMovement } = this;
                proposedMovement.x = (forward.x * moveY + right.x * moveX) * moveDistance;
                proposedMovement.y = 0;
                proposedMovement.z = (forward.z * moveY + right.z * moveX) * moveDistance;

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
