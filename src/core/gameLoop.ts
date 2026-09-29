import type { Renderer, TextureHandle } from '../services/renderer';
import type { Input, PlayerIntent } from '../services/input';
import type { TypeSafeEventBus } from './events';
import {
    createCamera,
    getCameraMatrix,
    INSTANCE_CHARACTER_SIZE,
    PLAYER_SPEED,
    PLAYER_HEIGHT,
    PLAYER_RADIUS,
    getCameraForward,
    getCameraRight,
    type Camera,
} from './camera';
import {
    resolveCollision,
    createCollisionContext,
    updatePlayerAABB,
    checkCollision,
    type CollisionContext,
} from './collision';
import {
    matrixMultiplyInto,
    identity,
    quaternionFromYawPitch,
    quaternionApplyToVector,
    smoothstep,
    lerpVec3,
    orthographic,
} from './math/mathHelpers';
import { World } from './world';
import type { Vec3, Mat4 } from '../types/common';
import {
    SCENE_TILE_SIZE,
    Scene2DSystem,
} from './scene';
import { GameMode, GameState } from './gameState';

const FIXED_DT = 1 / 60;
const TRANSITION_DURATION = 1;

export interface DebugHUD {
    // eslint-disable-next-line no-unused-vars
    render: (_info: {
        cameraPosition: Vec3;
        cameraForward: Vec3;
        sunPosition?: Vec3;
        moonPosition?: Vec3;
        timeOfDay?: number;
        yaw?: number;
        pitch?: number;
        gameMode?: string;
        instancePosition?: Vec3;
        currentChunk?: { x: number; z: number; hasContent: boolean };
    }) => void;
    toggle: () => void;
    isVisible: () => boolean;
}

export class GameLoop {
    // State variables
    private accumulator = 0;

    private scene2DSystem: Scene2DSystem;

    private eventBus: TypeSafeEventBus;

    private gameState: GameState;

    private partyMemberTexture1: TextureHandle | null = null;

    // Core objects
    private camera: Camera;

    private collisionContext: CollisionContext;

    // Dependencies
    private renderer: Renderer;

    private input: Input;

    private world: World;

    private getAspectRatio: () => number;

    private debugHUD?: DebugHUD;

    // Constants
    private readonly DAY_LENGTH_SECONDS = 120; // 2 minutes per full cycle (configurable)

    private readonly HORIZON_THRESHOLD = 0.0; // Elevation threshold for horizon (radians)

    private readonly DECLINATION_OFFSET = 0.0; // Seasonal tilt offset (for future use, currently 0)

    private readonly SUN_SIZE = 0.5; // Radius of sun orb (sphere)

    private readonly MOON_SIZE = 0.4; // Radius of moon orb (sphere)

    private readonly SUN_COLOR: Vec3 = { x: 1.0, y: 0.85, z: 0.2 }; // Golden yellow

    private readonly MOON_COLOR: Vec3 = { x: 0.4, y: 0.6, z: 0.9 }; // Cool blue

    private readonly CELESTIAL_DISTANCE: number; // Computed from camera.far

    private readonly WALL_DEBUG_COLOR: Vec3 = { x: 1, y: 0, z: 0 }; // Color of the wall debug mesh

    /*
     * PERFORMANCE:
     * All objects are pre-allocated and reused every frame.
     * This avoids allocation overhead and improves performance.
     * This is a performance optimization, not a design principle.
     */

    // Pre-allocated lighting calculation objects
    private readonly lightDirection: Vec3 = { x: 0, y: 0, z: 0 }; // Direction from surface toward the sun

    private readonly sunAzimuth = { value: 0 }; // For spherical coordinate calculations

    private readonly sunElevation = { value: 0 }; // For spherical coordinate calculations

    // Pre-allocated sun objects
    private readonly sunPosition: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly sunColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly sunDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 }; // Negated light direction for sun positioning

    private readonly sunTransform: Mat4;

    // Pre-allocated moon objects
    private readonly moonPosition: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly moonLightDirection: Vec3 = { x: 0, y: 0, z: 0 }; // For moon (opposite of sun)

    private readonly moonColorWithVisibility: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly moonDirectionForPosition: Vec3 = { x: 0, y: 0, z: 0 }; // Negated moon direction for moon positioning

    private readonly moonTransform: Mat4;

    // Pre-allocated MVP matrices
    private readonly sunMVP: Mat4;

    private readonly moonMVP: Mat4;

    private readonly meshMVP: Mat4;

    private readonly circleTransform: Mat4; // Pre-allocated for circle rendering

    // Scene rendering matrices (pre-allocated)
    private readonly sceneSpriteTransform: Mat4; // Pre-allocated for sprite

    private readonly sceneOrthoProj: Mat4; // Pre-allocated orthographic projection

    // Mesh objects
    private readonly sunMesh;

    private readonly moonMesh;

    private readonly wallDebugMesh;

    // Pre-allocated scratch fields
    private readonly wallDebugTransform: Mat4 = identity();

    private readonly wallDebugMVP: Mat4 = identity();

    // Pre-allocated Vec3 objects for transition calculations
    private readonly transitionStartPos: Vec3 = { x: 0, y: 0, z: 0 };

    private readonly transitionEndPos: Vec3 = { x: 0, y: 0, z: 0 };

    constructor(
        renderer: Renderer,
        input: Input,
        world: World,
        getAspectRatio: () => number,
        eventBus: TypeSafeEventBus,
        gameState: GameState,
        debugHUD?: DebugHUD,
    ) {
        this.renderer = renderer;
        this.input = input;
        this.world = world;
        this.getAspectRatio = getAspectRatio;
        this.eventBus = eventBus;
        this.gameState = gameState;
        this.scene2DSystem = new Scene2DSystem(this.eventBus);
        this.debugHUD = debugHUD;

        // Core objects
        this.camera = createCamera();
        this.collisionContext = createCollisionContext();

        // Seed camera
        this.camera.position = { ...this.gameState.interpolated.cameraPosition };
        this.camera.yaw = this.gameState.interpolated.cameraYaw;
        this.camera.pitch = this.gameState.interpolated.cameraPitch;

        // Compute CELESTIAL_DISTANCE from camera.far
        this.CELESTIAL_DISTANCE = this.camera.far - 1.0; // Very large distance (effectively infinite, must be < camera.far)

        // Pre-allocated matrices
        this.sunTransform = identity();
        this.moonTransform = identity();
        this.sunMVP = identity();
        this.moonMVP = identity();
        this.meshMVP = identity();
        this.circleTransform = identity();
        this.sceneSpriteTransform = identity();
        this.sceneOrthoProj = identity();

        // Mesh objects
        this.sunMesh = renderer.createSphereMesh(this.SUN_SIZE * 10, 16);
        this.moonMesh = renderer.createSphereMesh(this.MOON_SIZE * 10, 16);
        this.wallDebugMesh = renderer.createCubeMesh(1);

        this.eventBus.subscribe('game_mode_changed', (event) => {
            console.log(`event - ${event.type}\n`, `curr mode: ${event.currentMode}\n`, `prev mode: ${event.previousMode}`);
            this.gameState.discrete.gameMode = event.currentMode;
        });

        // Load party textures asynchronously
        this.loadPartyTextures();
    }

    // TODO: Load 4 different shapes that match from a list of choices.
    private async loadPartyTextures(): Promise<void> {
        try {
            this.partyMemberTexture1 = await this.renderer.loadTexture('circle-sleep00');
        } catch (error) {
            console.error('Failed to load circle texture:', error);
        }
    }

    // Check if we're going to collide or move through AABB while transitioning to an instance
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

    private freezeTime(): void {
        const discreteState = this.gameState.discrete;
        const interpolatedState = this.gameState.interpolated;

        discreteState.isTimeFrozen = true;
        discreteState.savedPitch = this.camera.pitch;
        discreteState.targetPitch = 0; // Reset to horizontal view
        discreteState.isTransitioningPitch = true;

        // Start transition
        discreteState.instanceIsTransitioning = true;
        discreteState.instanceTransitionDirection = 1;
        interpolatedState.instanceTransitionProgress = 0.0;
        discreteState.instanceIsActive = false;

        this.calculateTransitionPositions();

        interpolatedState.instanceCharacterPosition.x = this.transitionStartPos.x;
        interpolatedState.instanceCharacterPosition.y = this.transitionStartPos.y;
        interpolatedState.instanceCharacterPosition.z = this.transitionStartPos.z;
    }

    // TODO: See above todo, de-instancing
    private unFreezeTime(): void {
        const discreteState = this.gameState.discrete;
        const interpolatedState = this.gameState.interpolated;

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
    }

    private calculateTransitionPositions(): void {
        // Circle starts at camera position (X/Z) and slides forward in the XZ plane
        // Use target pitch (0) for calculation since we're transitioning to it
        const forward = getCameraForward(this.camera.yaw, this.gameState.discrete.targetPitch);
        const circleSize = INSTANCE_CHARACTER_SIZE; // Circle radius
        const floorY = circleSize / 2; // Half circle size above floor (quad is centered at Y=0)

        // Start position: Camera's X/Z position at floor level
        this.transitionStartPos.x = this.camera.position.x;
        this.transitionStartPos.y = floorY;
        this.transitionStartPos.z = this.camera.position.z;

        // End position: Forward along camera direction, at floor level
        const forwardDistance = 3.0; // Distance to slide forward
        this.transitionEndPos.x = this.camera.position.x + forward.x * forwardDistance;
        this.transitionEndPos.y = floorY;
        this.transitionEndPos.z = this.camera.position.z + forward.z * forwardDistance;
    }

    private computeTimeOfDay(simTime: number): number {
        return (simTime % this.DAY_LENGTH_SECONDS) / this.DAY_LENGTH_SECONDS;
    }

    // PERFORMANCE: Writes into existing objects to avoid allocation
    private computeSunSpherical(
        timeOfDay: number,
        outAzimuth: { value: number },
        outElevation: { value: number },
    ): void {
        const angle = (timeOfDay - 0.25) * Math.PI * 2;

        const elevation = Math.sin(angle) + this.DECLINATION_OFFSET;
        const azimuth = Math.PI / 2 + angle;

        // eslint-disable-next-line no-param-reassign
        outAzimuth.value = azimuth;
        // eslint-disable-next-line no-param-reassign
        outElevation.value = elevation;
    }

    // TODO: Decouple from gameloop
    private setGameMode(newMode: GameMode): void {
        const previousMode = this.gameState.discrete.gameMode;

        if (previousMode === newMode) {
            return;
        }

        this.gameState.discrete.gameMode = newMode;

        this.eventBus.publish({
            type: 'game_mode_changed',
            previousMode,
            currentMode: newMode,
        });
    }

    // PERFORMANCE: Writes into existing object to avoid allocation
    private sphericalToDirection(
        azimuth: number,
        elevation: number,
        out: Vec3,
    ): void {
        const cosElev = Math.cos(elevation);
        out.x = cosElev * Math.sin(azimuth);
        out.y = Math.sin(elevation);
        out.z = cosElev * Math.cos(azimuth);

        // Normalize even if already normalized
        // Prevents NaN errors from dividing by zero.
        const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
        if (len > 0.0001) {
            out.x /= len;
            out.y /= len;
            out.z /= len;
        }
    }

    // PERFORMANCE: Writes into existing object to avoid allocation
    private computeSunDirection(timeOfDay: number, out: Vec3): void {
        const azimuth = { value: 0 };
        const elevation = { value: 0 };

        this.computeSunSpherical(timeOfDay, azimuth, elevation);
        this.sphericalToDirection(azimuth.value, elevation.value, out);
    }

    // PERFORMANCE: Pure function, no allocations
    private computeAmbientIntensity(elevation: number): number {
        // Normalize elevation from [-1, 1] to [0, 1]
        const normalizedElev = Math.max(0, Math.min(1, (elevation + 1) / 2));

        // Elevation-based ambient transition
        const t = normalizedElev;
        let smoothT = 0;
        if (t <= 0) {
            smoothT = 0;
        } else if (t >= 1) {
            smoothT = 1;
        } else {
            smoothT = t * t * (3 - 2 * t); // Smoothstep function
        }

        // Interpolate between 0.1 (night) and 0.5 (day)
        return 0.1 + (0.5 - 0.1) * smoothT;
    }

    // PERFORMANCE: Pure function, no allocations
    // Replaces computeSunVisibility/computeMoonVisibility. Each body's visibility now
    // depends only on ITS OWN elevation, fading smoothly through the horizon band
    // instead of being derived from the other body's time-of-day triangle. This is
    // what lets the sun and moon fade independently and in sync with where they're
    // actually drawn, instead of one snapping to full/zero based on the other.
    private computeCelestialVisibility(elevation: number): number {
        const FADE_BAND = 0.15; // how far above/below the horizon the fade extends
        const t = Math.max(0, Math.min(1, (elevation + FADE_BAND) / (2 * FADE_BAND)));
        return t * t * (3 - 2 * t); // smoothstep: no fade at the horizon, smooth ends
    }

    // PERFORMANCE: Writes into existing object to avoid allocation (complies with RULE M-1)
    private computeCelestialPosition(
        dirVec: Vec3,
        distance: number,
        playerPosition: Vec3,
        out: Vec3,
    ): void {
        out.x = playerPosition.x + dirVec.x * distance;
        out.y = playerPosition.y + dirVec.y * distance;
        out.z = playerPosition.z + dirVec.z * distance;
    }

    // PERFORMANCE: Writes into existing matrix to avoid allocation
    private computeCelestialTransform(
        position: Vec3,
        size: number,
        out: Mat4,
    ): void {
        const o = out.elements;

        o[0] = size; o[1] = 0; o[2] = 0; o[3] = 0;
        o[4] = 0; o[5] = size; o[6] = 0; o[7] = 0;
        o[8] = 0; o[9] = 0; o[10] = size; o[11] = 0;
        o[12] = position.x; o[13] = position.y; o[14] = position.z; o[15] = 1;
    }

    // Same column-major layout as computeCelestialTransform, just per-axis scale
    // instead of uniform - a scaled-and-translated box instead of a scaled sphere.
    private computeScaledTransform(
        center: Vec3,
        scale: Vec3,
        out: Mat4,
    ): void {
        const o = out.elements;

        o[0] = scale.x; o[1] = 0; o[2] = 0; o[3] = 0;
        o[4] = 0; o[5] = scale.y; o[6] = 0; o[7] = 0;
        o[8] = 0; o[9] = 0; o[10] = scale.z; o[11] = 0;
        o[12] = center.x; o[13] = center.y; o[14] = center.z; o[15] = 1;
    }

    private renderBoundaryWireframe(viewProj: Mat4): void {
        if (!this.renderer.getWireframeEnabled?.()) return;

        this.world.getBoundaryWallAABBs().forEach((wall) => {
            const center = {
                x: (wall.min.x + wall.max.x) / 2,
                y: (wall.min.y + wall.max.y) / 2,
                z: (wall.min.z + wall.max.z) / 2,
            };
            const scale = {
                x: wall.max.x - wall.min.x,
                y: wall.max.y - wall.min.y,
                z: wall.max.z - wall.min.z,
            };
            this.computeScaledTransform(center, scale, this.wallDebugTransform);
            matrixMultiplyInto(viewProj, this.wallDebugTransform, this.wallDebugMVP);
            this.renderer.drawMesh(this.wallDebugMesh, this.wallDebugMVP, this.WALL_DEBUG_COLOR, true);
        });
    }

    private updateSimulation(dt: number, intent: PlayerIntent): void {
        const discreteState = this.gameState.discrete;
        const interpolatedState = this.gameState.interpolated;

        this.scene2DSystem.update(dt, this.gameState, intent);

        if (discreteState.gameMode === 'world_3d') {
            this.camera.position = { ...interpolatedState.cameraPosition };
            this.camera.yaw = interpolatedState.cameraYaw;
            this.camera.pitch = interpolatedState.cameraPitch;
        }

        if (discreteState.gameMode === 'scene_2d') return;

        if (intent.pause && discreteState.gameMode === 'world_3d') {
            if (discreteState.isTimeFrozen) {
                this.unFreezeTime();
            } else {
                this.freezeTime();
            }
        }

        // Handle debug HUD toggle configurations
        if (intent.toggleDebugHUD) {
            if (this.debugHUD) {
                this.debugHUD.toggle();
                discreteState.debugHUDVisible = this.debugHUD.isVisible();
            } else {
                console.warn('Debug HUD toggle requested but debugHUD not available');
            }
        }

        // Update instance state transition (only when time is frozen)
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
            }
        }

        // Update camera pitch transition (when time is frozen, going to 0)
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

        // Handle WASD movement for circle character in instance mode
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

        if (discreteState.isTimeFrozen) {
            return;
        }

        // Normal 3D simulation updates
        interpolatedState.simulationTime += dt;

        const sensitivity = 0.005;
        this.camera.yaw += intent.look.yaw * sensitivity;
        this.camera.pitch -= intent.look.pitch * sensitivity;

        const limit = Math.PI / 2 - 0.01;
        this.camera.pitch = Math.max(-limit, Math.min(limit, this.camera.pitch));

        interpolatedState.cameraYaw = this.camera.yaw;
        interpolatedState.cameraPitch = this.camera.pitch;

        const { x: moveX, y: moveY } = intent.move;

        if (moveX !== 0 || moveY !== 0) {
            const forward = getCameraForward(this.camera.yaw, this.camera.pitch);
            const right = getCameraRight(this.camera.yaw);

            const proposedMovement = {
                x: (forward.x * moveY + right.x * moveX) * PLAYER_SPEED * dt,
                y: 0,
                z: (forward.z * moveY + right.z * moveX) * PLAYER_SPEED * dt,
            };

            const worldAABBs = this.world.getCollidableAABBs();

            const resolvedMovement = resolveCollision(
                this.camera.position,
                proposedMovement,
                worldAABBs,
                PLAYER_HEIGHT,
                PLAYER_RADIUS,
                this.collisionContext,
            );

            this.camera.position.x += resolvedMovement.x;
            this.camera.position.z += resolvedMovement.z;
            this.camera.position.y = PLAYER_HEIGHT;

            interpolatedState.cameraPosition = { ...this.camera.position };
        }
    }

    update(deltaTime: number): void {
        this.accumulator += deltaTime;

        const intentSnapshot = this.input.getIntent();

        while (this.accumulator >= FIXED_DT) {
            this.updateSimulation(FIXED_DT, intentSnapshot);
            this.accumulator -= FIXED_DT;
        }

        this.eventBus.flush();
    }

    render(): void {
        this.renderer.beginFrame();
        const discreteState = this.gameState.discrete;
        const interpolatedState = this.gameState.interpolated;

        // Chunk debug data
        const currentChunkCoords = World.getChunkCoords(this.camera.position);
        const currentChunkData = this.world.activeChunks.get(World.getChunkID(currentChunkCoords.x, currentChunkCoords.z));

        // Scene mode rendering (2D overlay)
        if (discreteState.gameMode === 'scene_2d') {
            // 1. Render frozen 3D world (normal 3D rendering, camera frozen)
            const aspect = this.getAspectRatio();
            const viewProj = getCameraMatrix(this.camera, aspect);

            // PERFORMANCE: Reuse pre-allocated objects, zero allocations per frame
            const timeOfDay = this.computeTimeOfDay(interpolatedState.simulationTime);

            this.computeSunSpherical(timeOfDay, this.sunAzimuth, this.sunElevation);
            this.computeSunDirection(timeOfDay, this.lightDirection);

            const ambientIntensity = this.computeAmbientIntensity(this.sunElevation.value);
            const moonAzimuth = { value: this.sunAzimuth.value + Math.PI };
            const moonElevation = { value: -this.sunElevation.value };
            this.sphericalToDirection(moonAzimuth.value, moonElevation.value, this.moonLightDirection);

            this.renderBoundaryWireframe(viewProj);

            // Each body's visibility comes from ITS OWN elevation, not the other
            // body's time-of-day triangle - see computeCelestialVisibility for why.
            const sunVisibility = this.computeCelestialVisibility(this.sunElevation.value);
            const moonVisibility = this.computeCelestialVisibility(moonElevation.value);

            this.sunColorWithVisibility.x = this.SUN_COLOR.x * sunVisibility;
            this.sunColorWithVisibility.y = this.SUN_COLOR.y * sunVisibility;
            this.sunColorWithVisibility.z = this.SUN_COLOR.z * sunVisibility;

            this.moonColorWithVisibility.x = this.MOON_COLOR.x * moonVisibility;
            this.moonColorWithVisibility.y = this.MOON_COLOR.y * moonVisibility;
            this.moonColorWithVisibility.z = this.MOON_COLOR.z * moonVisibility;

            if (this.renderer.setCelestialLighting) {
                this.renderer.setCelestialLighting(
                    { direction: this.lightDirection, color: this.sunColorWithVisibility },
                    { direction: this.moonLightDirection, color: this.moonColorWithVisibility },
                );
            }
            if (this.renderer.setAmbientIntensity) {
                this.renderer.setAmbientIntensity(ambientIntensity);
            }

            this.sunDirectionForPosition.x = this.lightDirection.x;
            this.sunDirectionForPosition.y = this.lightDirection.y;
            this.sunDirectionForPosition.z = this.lightDirection.z;

            this.computeCelestialPosition(
                this.sunDirectionForPosition,
                this.CELESTIAL_DISTANCE,
                this.camera.position,
                this.sunPosition,
            );

            this.moonDirectionForPosition.x = this.moonLightDirection.x;
            this.moonDirectionForPosition.y = this.moonLightDirection.y;
            this.moonDirectionForPosition.z = this.moonLightDirection.z;

            this.computeCelestialPosition(
                this.moonDirectionForPosition,
                this.CELESTIAL_DISTANCE,
                this.camera.position,
                this.moonPosition,
            );
            this.computeCelestialTransform(this.sunPosition, this.SUN_SIZE, this.sunTransform);
            this.computeCelestialTransform(this.moonPosition, this.MOON_SIZE, this.moonTransform);

            if (sunVisibility > 0) {
                matrixMultiplyInto(viewProj, this.sunTransform, this.sunMVP);
                this.renderer.drawMesh(this.sunMesh, this.sunMVP, this.sunColorWithVisibility, true);
            }

            if (moonVisibility > 0) {
                matrixMultiplyInto(viewProj, this.moonTransform, this.moonMVP);
                this.renderer.drawMesh(this.moonMesh, this.moonMVP, this.moonColorWithVisibility, true);
            }

            const visibleMeshes = this.world.getVisibleMeshes();
            visibleMeshes.forEach((sm) => {
                matrixMultiplyInto(viewProj, sm.transform, this.meshMVP);
                this.renderer.drawMesh(sm.mesh, this.meshMVP, sm.color);
            });

            // 2. Render pink overlay (2D screen-space)
            const width = this.renderer.getViewportWidth?.() ?? 800;
            const height = this.renderer.getViewportHeight?.() ?? 600;

            // Create orthographic projection for screen-space rendering
            // Maps pixel coordinates (0-width, 0-height) directly to clip space
            const orthoProj = orthographic(0, width, height, 0, 0.1, 100.0);
            // Copy into pre-allocated matrix (reuse elements array)
            const orthoElements = orthoProj.elements;
            const sceneOrthoElements = this.sceneOrthoProj.elements;
            for (let i = 0; i < 16; i += 1) {
                sceneOrthoElements[i] = orthoElements[i];
            }

            // Render pink overlay using clear() if available, otherwise use a full-screen quad
            if (this.renderer.clear) {
                // Apply transition alpha for fade in/out
                const alpha = smoothstep(interpolatedState.sceneTransitionProgress);
                const pinkR = 1.0;
                const pinkG = 0.41; // 105/255
                const pinkB = 0.71; // 180/255
                this.renderer.clear(pinkR * alpha, pinkG * alpha, pinkB * alpha, alpha);
            }

            // 3. Render scene sprite (2D screen-space)
            if (this.partyMemberTexture1) {
                // positionPx is already in pixel coordinates (0-799, 0-599)
                const spriteSize = SCENE_TILE_SIZE; // 32x32 pixels
                const posX = interpolatedState.sceneCharacterPositionPx.x;
                const posY = interpolatedState.sceneCharacterPositionPx.y;

                // Create model transform matrix: scale then translate
                // For 2D screen-space: scale(spriteSize) * translate(posX, posY, 0.5)
                // Build transform matrix directly (scale + translation)
                const m = this.sceneSpriteTransform.elements;
                // Scale by sprite size
                m[0] = spriteSize; m[1] = 0; m[2] = 0; m[3] = 0;
                m[4] = 0; m[5] = spriteSize; m[6] = 0; m[7] = 0;
                m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
                // Translate to screen position (Z = 0.5 for depth)
                m[12] = posX; m[13] = posY; m[14] = -0.5; m[15] = 1;

                // Multiply projection * model into meshMVP (reuse existing matrix)
                matrixMultiplyInto(this.sceneOrthoProj, this.sceneSpriteTransform, this.meshMVP);
                this.renderer.drawScreenQuad(this.partyMemberTexture1, this.meshMVP);
            }

            // 4. Render debug HUD (if visible, same as normal)
            if (this.debugHUD && discreteState.debugHUDVisible) {
                const rotation = quaternionFromYawPitch(this.camera.yaw, this.camera.pitch);
                const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

                this.debugHUD.render({
                    cameraPosition: this.camera.position,
                    cameraForward: forward,
                    sunPosition: this.sunPosition,
                    moonPosition: this.moonPosition,
                    timeOfDay,
                    yaw: this.camera.yaw,
                    pitch: this.camera.pitch,
                    gameMode: discreteState.gameMode,
                    instancePosition: (discreteState.isTimeFrozen && (discreteState.instanceIsTransitioning || discreteState.instanceIsActive))
                        ? interpolatedState.instanceCharacterPosition
                        : undefined,
                    currentChunk: {
                        x: currentChunkCoords.x,
                        z: currentChunkCoords.z,
                        hasContent: currentChunkData?.hasContent ?? false,
                    },
                });
            }

            this.renderer.endFrame();
            return;
        }

        // Normal 3D world rendering
        const aspect = this.getAspectRatio();
        const viewProj = getCameraMatrix(this.camera, aspect);

        // PERFORMANCE: Reuse pre-allocated objects, zero allocations per frame
        // When time is frozen, use last timeOfDay (frozen)
        const timeOfDay = discreteState.isTimeFrozen
            ? this.computeTimeOfDay(interpolatedState.simulationTime)
            : this.computeTimeOfDay(interpolatedState.simulationTime);

        this.renderBoundaryWireframe(viewProj);

        this.computeSunSpherical(timeOfDay, this.sunAzimuth, this.sunElevation);
        this.computeSunDirection(timeOfDay, this.lightDirection);

        const ambientIntensity = this.computeAmbientIntensity(this.sunElevation.value);
        const moonAzimuth = { value: this.sunAzimuth.value + Math.PI };
        const moonElevation = { value: -this.sunElevation.value };

        this.sphericalToDirection(moonAzimuth.value, moonElevation.value, this.moonLightDirection);

        const sunVisibility = this.computeCelestialVisibility(this.sunElevation.value);
        const moonVisibility = this.computeCelestialVisibility(moonElevation.value);

        this.sunColorWithVisibility.x = this.SUN_COLOR.x * sunVisibility;
        this.sunColorWithVisibility.y = this.SUN_COLOR.y * sunVisibility;
        this.sunColorWithVisibility.z = this.SUN_COLOR.z * sunVisibility;

        this.moonColorWithVisibility.x = this.MOON_COLOR.x * moonVisibility;
        this.moonColorWithVisibility.y = this.MOON_COLOR.y * moonVisibility;
        this.moonColorWithVisibility.z = this.MOON_COLOR.z * moonVisibility;

        if (this.renderer.setCelestialLighting) {
            this.renderer.setCelestialLighting(
                { direction: this.lightDirection, color: this.sunColorWithVisibility },
                { direction: this.moonLightDirection, color: this.moonColorWithVisibility },
            );
        }
        if (this.renderer.setAmbientIntensity) {
            this.renderer.setAmbientIntensity(ambientIntensity);
        }

        this.sunDirectionForPosition.x = this.lightDirection.x;
        this.sunDirectionForPosition.y = this.lightDirection.y;
        this.sunDirectionForPosition.z = this.lightDirection.z;

        this.computeCelestialPosition(
            this.sunDirectionForPosition,
            this.CELESTIAL_DISTANCE,
            this.camera.position,
            this.sunPosition,
        );

        this.moonDirectionForPosition.x = this.moonLightDirection.x;
        this.moonDirectionForPosition.y = this.moonLightDirection.y;
        this.moonDirectionForPosition.z = this.moonLightDirection.z;

        this.computeCelestialPosition(
            this.moonDirectionForPosition,
            this.CELESTIAL_DISTANCE,
            this.camera.position,
            this.moonPosition,
        );
        this.computeCelestialTransform(this.sunPosition, this.SUN_SIZE, this.sunTransform);
        this.computeCelestialTransform(this.moonPosition, this.MOON_SIZE, this.moonTransform);

        if (sunVisibility > 0) {
            matrixMultiplyInto(viewProj, this.sunTransform, this.sunMVP);
            this.renderer.drawMesh(this.sunMesh, this.sunMVP, this.sunColorWithVisibility, true);
        }

        if (moonVisibility > 0) {
            matrixMultiplyInto(viewProj, this.moonTransform, this.moonMVP);
            this.renderer.drawMesh(this.moonMesh, this.moonMVP, this.moonColorWithVisibility, true);
        }

        const visibleMeshes = this.world.getVisibleMeshes();
        visibleMeshes.forEach((sm) => {
            matrixMultiplyInto(viewProj, sm.transform, this.meshMVP);
            this.renderer.drawMesh(sm.mesh, this.meshMVP, sm.color);
        });

        // Render lead party member when time is frozen and active/transitioning
        if (discreteState.isTimeFrozen && (discreteState.instanceIsTransitioning || discreteState.instanceIsActive)) {
            if (this.partyMemberTexture1) {
                // Calculate transform for circle (billboard at character position)
                const pos = interpolatedState.instanceCharacterPosition;
                const circleSize = INSTANCE_CHARACTER_SIZE; // Small size as specified

                // Calculate billboard orientation (face camera, stay vertical)
                const toCamera = {
                    x: this.camera.position.x - pos.x,
                    y: 0, // Keep vertical
                    z: this.camera.position.z - pos.z,
                };
                const dist = Math.sqrt(toCamera.x * toCamera.x + toCamera.z * toCamera.z);
                if (dist > 0.001) {
                    toCamera.x /= dist;
                    toCamera.z /= dist;
                } else {
                    toCamera.x = 0;
                    toCamera.z = 1;
                }

                // Right vector (perpendicular to toCamera in XZ plane)
                const right = { x: -toCamera.z, y: 0, z: toCamera.x };
                const up = { x: 0, y: 1, z: 0 };

                // Create billboard transform matrix (rotation + translation)
                // Matrix columns: [right*size, ?, up*size, position]
                // Shader uses a_position.x -> column 0, a_position.z -> column 2
                // Scale right and up by circleSize
                const m = this.circleTransform.elements;
                // Column 0: right vector (for a_position.x)
                m[0] = right.x * circleSize; m[1] = right.y * circleSize; m[2] = right.z * circleSize; m[3] = 0;
                // Column 1: unused (shader uses a_position.y = 0)
                m[4] = 0; m[5] = 0; m[6] = 0; m[7] = 0;
                // Column 2: up vector (for a_position.z)
                m[8] = up.x * circleSize; m[9] = up.y * circleSize; m[10] = up.z * circleSize; m[11] = 0;
                // Column 3: position
                m[12] = pos.x; m[13] = pos.y; m[14] = pos.z; m[15] = 1;

                // Multiply by view-projection matrix (use meshMVP as temporary, already rendered world meshes)
                matrixMultiplyInto(viewProj, this.circleTransform, this.meshMVP);
                // Render textured quad (no camera position needed - billboard calculated on CPU)
                this.renderer.drawTexturedQuad(this.partyMemberTexture1, this.meshMVP, 1.0, toCamera);
            }
            // Texture not loaded yet - could render placeholder here if needed
        }

        if (this.debugHUD && discreteState.debugHUDVisible) {
            const rotation = quaternionFromYawPitch(this.camera.yaw, this.camera.pitch);
            const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

            this.debugHUD.render({
                cameraPosition: this.camera.position,
                cameraForward: forward,
                sunPosition: this.sunPosition,
                moonPosition: this.moonPosition,
                timeOfDay,
                yaw: this.camera.yaw,
                pitch: this.camera.pitch,
                gameMode: discreteState.gameMode,
                instancePosition: (discreteState.isTimeFrozen && (discreteState.instanceIsTransitioning || discreteState.instanceIsActive))
                    ? interpolatedState.instanceCharacterPosition
                    : undefined,
                currentChunk: {
                    x: currentChunkCoords.x,
                    z: currentChunkCoords.z,
                    hasContent: currentChunkData?.hasContent ?? false,
                },
            });
        }

        this.renderer.endFrame();
    }

    getCameraPosition(): Vec3 {
        return this.gameState.interpolated.cameraPosition;
    }

    getTimeOfDay(): number {
        return (this.gameState.interpolated.simulationTime % this.DAY_LENGTH_SECONDS) / this.DAY_LENGTH_SECONDS;
    }
}

export default GameLoop;
