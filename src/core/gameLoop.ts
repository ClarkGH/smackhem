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
    type CollisionContext,
} from './collision';
import {
    matrixMultiplyInto,
    identity,
    quaternionFromYawPitch,
    quaternionApplyToVector,
    smoothstep,
    orthographic,
} from './math/mathHelpers';
import { World } from './world';
import type { Vec3, Mat4 } from '../types/common';
import {
    SCENE_TILE_SIZE,
    Scene2DSystem,
} from './scene';
import { GameState } from './gameState';
import Instance3DSystem from './instance';
import EnvironmentSystem from './environment';

const FIXED_DT = 1 / 60;

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

    private instance3DSystem: Instance3DSystem;

    private eventBus: TypeSafeEventBus;

    private gameState: GameState;

    private environmentSystem: EnvironmentSystem;

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
        this.instance3DSystem = new Instance3DSystem(this.collisionContext, this.world, this.camera, this.eventBus);
        this.environmentSystem = new EnvironmentSystem(this.camera.far);

        // Seed camera
        this.camera.position = { ...this.gameState.interpolated.cameraPosition };
        this.camera.yaw = this.gameState.interpolated.cameraYaw;
        this.camera.pitch = this.gameState.interpolated.cameraPitch;

        // Compute CELESTIAL_DISTANCE from camera.far
        this.CELESTIAL_DISTANCE = this.camera.far - 1.0; // Very large distance (effectively infinite, must be < camera.far)

        // Pre-allocated matrices
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
        this.instance3DSystem.update(dt, this.gameState, intent);
        

        // TODO: Revisit if this needs to be at the top still
        if (discreteState.gameMode === 'world_3d') {
            this.camera.position = { ...interpolatedState.cameraPosition };
            this.camera.yaw = interpolatedState.cameraYaw;
            this.camera.pitch = interpolatedState.cameraPitch;
        }

        if (discreteState.gameMode === 'scene_2d') return;
        if (discreteState.gameMode === 'instance_3d' || discreteState.isTimeFrozen) return;

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

        if (intentSnapshot.toggleDebugHUD) {
            if (this.debugHUD) {
                this.debugHUD.toggle();
                this.gameState.discrete.debugHUDVisible = this.debugHUD.isVisible();
            } else {
                console.warn('Debug HUD toggle requested but debugHUD not available');
            }
        }

        if (intentSnapshot.pause) {
            if (this.gameState.discrete.isTimeFrozen) {
                this.instance3DSystem.unPropagateInstance(this.gameState);
            } else {
                this.instance3DSystem.propagateInstance(this.gameState);
            }
        }

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

        // Set moon and sun size to 1 to prevent scaling issues
        this.environmentSystem.update(this.gameState, this.camera.position, 1, 1);

        // Scene mode rendering (2D overlay)
        if (discreteState.gameMode === 'scene_2d') {
            const aspect = this.getAspectRatio();
            const viewProj = getCameraMatrix(this.camera, aspect);

            this.renderBoundaryWireframe(viewProj);

            if (this.renderer.setCelestialLighting) {
                this.renderer.setCelestialLighting(
                    { direction: this.environmentSystem.lightDirection, color: this.environmentSystem.sunColorWithVisibility },
                    { direction: this.environmentSystem.moonLightDirection, color: this.environmentSystem.moonColorWithVisibility },
                );
            }
            if (this.renderer.setAmbientIntensity) {
                this.renderer.setAmbientIntensity(this.environmentSystem.ambientIntensity);
            }

            if (this.environmentSystem.sunVisibility > 0) {
                matrixMultiplyInto(viewProj, this.environmentSystem.sunTransform, this.sunMVP);
                this.renderer.drawMesh(this.sunMesh, this.sunMVP, this.environmentSystem.sunColorWithVisibility, true);
            }

            if (this.environmentSystem.moonVisibility > 0) {
                matrixMultiplyInto(viewProj, this.environmentSystem.moonTransform, this.moonMVP);
                this.renderer.drawMesh(this.moonMesh, this.moonMVP, this.environmentSystem.moonColorWithVisibility, true);
            }

            const visibleMeshes = this.world.getVisibleMeshes();
            visibleMeshes.forEach((sm) => {
                matrixMultiplyInto(viewProj, sm.transform, this.meshMVP);
                this.renderer.drawMesh(sm.mesh, this.meshMVP, sm.color);
            });

            // Render pink overlay (2D screen-space)
            const width = this.renderer.getViewportWidth?.() ?? 800;
            const height = this.renderer.getViewportHeight?.() ?? 600;

            const orthoProj = orthographic(0, width, height, 0, 0.1, 100.0);
            const orthoElements = orthoProj.elements;
            const sceneOrthoElements = this.sceneOrthoProj.elements;
            for (let i = 0; i < 16; i += 1) {
                sceneOrthoElements[i] = orthoElements[i];
            }

            if (this.renderer.clear) {
                const alpha = smoothstep(interpolatedState.sceneTransitionProgress);
                this.renderer.clear(1.0 * alpha, 0.41 * alpha, 0.71 * alpha, alpha);
            }

            // Render scene sprite (2D screen-space)
            if (this.partyMemberTexture1) {
                const spriteSize = SCENE_TILE_SIZE;
                const posX = interpolatedState.sceneCharacterPositionPx.x;
                const posY = interpolatedState.sceneCharacterPositionPx.y;

                const m = this.sceneSpriteTransform.elements;
                m[0] = spriteSize; m[1] = 0; m[2] = 0; m[3] = 0;
                m[4] = 0; m[5] = spriteSize; m[6] = 0; m[7] = 0;
                m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
                m[12] = posX; m[13] = posY; m[14] = -0.5; m[15] = 1;

                matrixMultiplyInto(this.sceneOrthoProj, this.sceneSpriteTransform, this.meshMVP);
                this.renderer.drawScreenQuad(this.partyMemberTexture1, this.meshMVP);
            }

            if (this.debugHUD && discreteState.debugHUDVisible) {
                const rotation = quaternionFromYawPitch(this.camera.yaw, this.camera.pitch);
                const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

                this.debugHUD.render({
                    cameraPosition: this.camera.position,
                    cameraForward: forward,
                    sunPosition: this.environmentSystem.sunPosition,
                    moonPosition: this.environmentSystem.moonPosition,
                    timeOfDay: this.environmentSystem.timeOfDay,
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

        // ==========================================
        // Normal 3D world rendering pass
        // ==========================================
        const aspect = this.getAspectRatio();
        const viewProj = getCameraMatrix(this.camera, aspect);

        this.renderBoundaryWireframe(viewProj);

        if (this.renderer.setCelestialLighting) {
            this.renderer.setCelestialLighting(
                { direction: this.environmentSystem.lightDirection, color: this.environmentSystem.sunColorWithVisibility },
                { direction: this.environmentSystem.moonLightDirection, color: this.environmentSystem.moonColorWithVisibility },
            );
        }
        if (this.renderer.setAmbientIntensity) {
            this.renderer.setAmbientIntensity(this.environmentSystem.ambientIntensity);
        }

        // 5. DRAW CELESTIAL ELEMENTS FOR MAIN WORLD STAGE
        if (this.environmentSystem.sunVisibility > 0) {
            matrixMultiplyInto(viewProj, this.environmentSystem.sunTransform, this.sunMVP);
            this.renderer.drawMesh(this.sunMesh, this.sunMVP, this.environmentSystem.sunColorWithVisibility, true);
        }

        if (this.environmentSystem.moonVisibility > 0) {
            matrixMultiplyInto(viewProj, this.environmentSystem.moonTransform, this.moonMVP);
            this.renderer.drawMesh(this.moonMesh, this.moonMVP, this.environmentSystem.moonColorWithVisibility, true);
        }

        const visibleMeshes = this.world.getVisibleMeshes();
        visibleMeshes.forEach((sm) => {
            matrixMultiplyInto(viewProj, sm.transform, this.meshMVP);
            this.renderer.drawMesh(sm.mesh, this.meshMVP, sm.color);
        });

        // Render lead party member when time is frozen and active/transitioning
        if (discreteState.isTimeFrozen && (discreteState.instanceIsTransitioning || discreteState.instanceIsActive)) {
            if (this.partyMemberTexture1) {
                const pos = interpolatedState.instanceCharacterPosition;
                const circleSize = INSTANCE_CHARACTER_SIZE;

                const toCamera = {
                    x: this.camera.position.x - pos.x,
                    y: 0,
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

                const right = { x: -toCamera.z, y: 0, z: toCamera.x };
                const up = { x: 0, y: 1, z: 0 };

                const m = this.circleTransform.elements;
                m[0] = right.x * circleSize; m[1] = right.y * circleSize; m[2] = right.z * circleSize; m[3] = 0;
                m[4] = 0; m[5] = 0; m[6] = 0; m[7] = 0;
                m[8] = up.x * circleSize; m[9] = up.y * circleSize; m[10] = up.z * circleSize; m[11] = 0;
                m[12] = pos.x; m[13] = pos.y; m[14] = pos.z; m[15] = 1;

                matrixMultiplyInto(viewProj, this.circleTransform, this.meshMVP);
                this.renderer.drawTexturedQuad(this.partyMemberTexture1, this.meshMVP, 1.0, toCamera);
            }
        }

        if (this.debugHUD && discreteState.debugHUDVisible) {
            const rotation = quaternionFromYawPitch(this.camera.yaw, this.camera.pitch);
            const forward = quaternionApplyToVector(rotation, { x: 0, y: 0, z: -1 });

            this.debugHUD.render({
                cameraPosition: this.camera.position,
                cameraForward: forward,
                sunPosition: this.environmentSystem.sunPosition,
                moonPosition: this.environmentSystem.moonPosition,
                timeOfDay: this.environmentSystem.timeOfDay,
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

    public getTimeOfDay(): number {
        return this.environmentSystem.timeOfDay;
    }
}

export default GameLoop;
