import type { Renderer, TextureHandle } from '../services/renderer';
import type { Input, PlayerIntent } from '../services/input';
import type { TypeSafeEventBus } from './events';
import {
    createCamera,
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
    identity,
} from './math/mathHelpers';
import { World } from './world';
import type { Vec3, Mat4 } from '../types/common';
import {
    Scene2DSystem,
} from './scene';
import { GameState } from './gameState';
import Instance3DSystem from './instance';
import EnvironmentSystem from './environment';
import RenderSystem from './renderSystem';

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

    private renderSystem: RenderSystem;

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
    private readonly SUN_SIZE = 0.5; // Radius of sun orb (sphere)

    private readonly MOON_SIZE = 0.4; // Radius of moon orb (sphere)

    private readonly WALL_DEBUG_COLOR: Vec3 = { x: 1, y: 0, z: 0 }; // Color of the wall debug mesh

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

        // Mesh objects
        this.sunMesh = renderer.createSphereMesh(this.SUN_SIZE * 10, 16);
        this.moonMesh = renderer.createSphereMesh(this.MOON_SIZE * 10, 16);
        this.wallDebugMesh = renderer.createCubeMesh(1);

        this.renderSystem = new RenderSystem(
            this.renderer,
            this.world,
            this.environmentSystem,
            this.getAspectRatio,
            this.sunMesh,
            this.moonMesh,
            this.wallDebugMesh,
        );

        this.eventBus.subscribe('game_mode_changed', (event) => {
            console.log(`event - ${event.type}\n`, `curr mode: ${event.currentMode}\n`, `prev mode: ${event.previousMode}`);
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
        this.environmentSystem.update(this.gameState, this.camera.position, 1.0, 1.0);

        this.renderSystem.render(
            this.gameState,
            this.camera,
            this.partyMemberTexture1,
            this.debugHUD,
            this.WALL_DEBUG_COLOR,
            this.wallDebugTransform,
            this.wallDebugMVP,
        );
    }

    getCameraPosition(): Vec3 {
        return this.gameState.interpolated.cameraPosition;
    }

    public getTimeOfDay(): number {
        return this.environmentSystem.timeOfDay;
    }
}

export default GameLoop;
