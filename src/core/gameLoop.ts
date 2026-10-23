import type { Renderer, TextureHandle } from '../services/renderer';
import type { Input, PlayerIntent } from '../services/input';
import type { MenuOverlay } from '../services/menuOverlay';
import type { DisplayCapabilities } from '../services/display';
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
import { createGameState, GameState } from './gameState';
import Instance3DSystem from './instance';
import MenuSystem from './menuSystem';
import { createDefaultSettings, type Settings } from './settings';
import EnvironmentSystem from './environment';
import RenderSystem from './renderSystem';

const FIXED_DT = 1 / 60;

// Radians per unit of mouse movement
const MOUSE_LOOK_SCALE = 0.005;

// Radians per second at full stick tilt
const STICK_TURN_SPEED = 2.5;

export interface DebugHUD {
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

    private menuSystem: MenuSystem;

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

    private menuOverlay?: MenuOverlay;

    // Shared, changed in place by the menu
    private settings: Settings;

    // Constants
    private readonly SUN_SIZE = 0.5; // Radius of sun orb (sphere)

    private readonly MOON_SIZE = 0.4; // Radius of moon orb (sphere)

    private readonly WALL_DEBUG_COLOR: Vec3 = { x: 1, y: 0, z: 0 }; // Color of the wall debug mesh

    // Mesh objects
    private readonly sunMesh;

    private readonly moonMesh;

    private readonly wallDebugMesh;

    // Mouse look waiting for the next tick, so a frame that runs no tick doesn't drop it
    private readonly pendingLook = { yaw: 0, pitch: 0 };

    // Camera as it was before the latest tick
    private readonly previousCamera = {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    };

    // What gets drawn: a blend of the last two ticks, so motion is smooth at any refresh rate
    private readonly renderCamera: Camera = createCamera();

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
        menuOverlay?: MenuOverlay,
        settings?: Settings,
        displayCapabilities?: DisplayCapabilities,
    ) {
        this.renderer = renderer;
        this.input = input;
        this.world = world;
        this.getAspectRatio = getAspectRatio;
        this.eventBus = eventBus;
        this.gameState = gameState;
        this.settings = settings ?? createDefaultSettings();
        this.scene2DSystem = new Scene2DSystem(this.eventBus, this.settings);
        this.menuSystem = new MenuSystem(this.eventBus, this.settings, displayCapabilities);
        this.debugHUD = debugHUD;
        this.menuOverlay = menuOverlay;

        // Core objects
        this.camera = createCamera();
        this.collisionContext = createCollisionContext();
        this.instance3DSystem = new Instance3DSystem(this.collisionContext, this.world, this.camera, this.eventBus, this.settings);
        this.environmentSystem = new EnvironmentSystem(this.camera.far);

        // Seed camera
        this.camera.position = { ...this.gameState.interpolated.cameraPosition };
        this.camera.yaw = this.gameState.interpolated.cameraYaw;
        this.camera.pitch = this.gameState.interpolated.cameraPitch;
        this.snapshotCamera();

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

        this.eventBus.subscribe('quit_to_main_menu_requested', () => this.quitToMainMenu());

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

        // Mouse look is a distance, used up by the first tick in any mode so it can't pile up in menus.
        // Stick look is a rate, applied every tick. Each device has its own sensitivity and invert.
        const { settings } = this;
        const mouseScale = MOUSE_LOOK_SCALE * settings.mouseSensitivity;
        const stickScale = STICK_TURN_SPEED * settings.controllerSensitivity * dt;
        const mouseInvert = settings.invertMouseY ? -1 : 1;
        const stickInvert = settings.invertControllerY ? -1 : 1;
        const lookYaw = this.pendingLook.yaw * mouseScale + (intent.lookRate?.yaw ?? 0) * stickScale;
        const lookPitch = this.pendingLook.pitch * mouseScale * mouseInvert
            + (intent.lookRate?.pitch ?? 0) * stickScale * stickInvert;
        this.pendingLook.yaw = 0;
        this.pendingLook.pitch = 0;

        // The menu button pauses play. Nothing else runs this tick.
        if (intent.menu && discreteState.gameMode !== 'main_menu' && !discreteState.isPaused) {
            discreteState.isPaused = true;
            this.menuSystem.openPause();
            return;
        }

        // The menu owns the tick, so confirming New Game can't also reach the scene's interact.
        // Paused, the simulation stops: no movement, transitions or day/night.
        if (discreteState.gameMode === 'main_menu' || discreteState.isPaused) {
            this.menuSystem.update(this.gameState, intent);
            return;
        }

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

        this.camera.yaw += lookYaw;
        this.camera.pitch -= lookPitch;

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

    public update(deltaTime: number): void {
        this.accumulator += deltaTime;

        const intentSnapshot = this.input.getIntent();
        this.pendingLook.yaw += intentSnapshot.look.yaw;
        this.pendingLook.pitch += intentSnapshot.look.pitch;

        if (intentSnapshot.toggleDebugHUD) {
            if (this.debugHUD) {
                this.debugHUD.toggle();
                this.gameState.discrete.debugHUDVisible = this.debugHUD.isVisible();
            } else {
                console.warn('Debug HUD toggle requested but debugHUD not available');
            }
        }

        // The instance toggle, not the pause menu, and not while paused
        if (intentSnapshot.pause && !this.gameState.discrete.isPaused) {
            if (this.gameState.discrete.isTimeFrozen) {
                this.instance3DSystem.unPropagateInstance(this.gameState);
            } else {
                this.instance3DSystem.propagateInstance(this.gameState);
            }
        }

        while (this.accumulator >= FIXED_DT) {
            this.snapshotCamera();
            this.updateSimulation(FIXED_DT, intentSnapshot);

            // Consume edge-triggered actions to prevent double-consumption
            intentSnapshot.interact = false;
            intentSnapshot.pause = false;
            intentSnapshot.navigate = undefined;
            intentSnapshot.back = false;
            intentSnapshot.menu = false;
            intentSnapshot.menuPointer = undefined;

            this.accumulator -= FIXED_DT;
        }

        this.eventBus.flush();
    }

    /**
     * Throws the run away and goes back to the main menu as if freshly booted.
     * The GameState object is shared, so its contents are replaced rather than the object itself.
     */
    private quitToMainMenu(): void {
        const previousMode = this.gameState.discrete.gameMode;
        const fresh = createGameState('main_menu');
        this.gameState.discrete = fresh.discrete;
        this.gameState.interpolated = fresh.interpolated;

        this.camera.position = { ...fresh.interpolated.cameraPosition };
        this.camera.yaw = fresh.interpolated.cameraYaw;
        this.camera.pitch = fresh.interpolated.cameraPitch;
        // No blending from where the run ended
        this.snapshotCamera();
        this.pendingLook.yaw = 0;
        this.pendingLook.pitch = 0;

        this.menuSystem.reset();
        this.eventBus.publish({ type: 'game_mode_changed', previousMode, currentMode: 'main_menu' });
    }

    // Copies values: camera.position is replaced, not mutated, by some systems
    private snapshotCamera(): void {
        const prev = this.previousCamera;
        prev.x = this.camera.position.x;
        prev.y = this.camera.position.y;
        prev.z = this.camera.position.z;
        prev.yaw = this.camera.yaw;
        prev.pitch = this.camera.pitch;
    }

    /**
     * The camera to draw: between the previous and current tick, by how far the clock is into the next one.
     * Rendering trails the simulation by up to one tick (about 16ms), the usual cost of this approach.
     */
    public getRenderCamera(): Readonly<Camera> {
        const alpha = this.accumulator / FIXED_DT;
        const prev = this.previousCamera;
        const render = this.renderCamera;
        render.position.x = prev.x + (this.camera.position.x - prev.x) * alpha;
        render.position.y = prev.y + (this.camera.position.y - prev.y) * alpha;
        render.position.z = prev.z + (this.camera.position.z - prev.z) * alpha;
        render.yaw = prev.yaw + (this.camera.yaw - prev.yaw) * alpha;
        render.pitch = prev.pitch + (this.camera.pitch - prev.pitch) * alpha;
        return render;
    }

    public render(): void {
        const renderCamera = this.getRenderCamera();
        this.environmentSystem.update(this.gameState, renderCamera.position, 1.0, 1.0);

        if (this.menuOverlay && this.menuSystem.consumeViewChanged()) {
            const { gameMode, isPaused } = this.gameState.discrete;
            this.menuOverlay.render(gameMode === 'main_menu' || isPaused ? this.menuSystem.getView() : null);
        }

        this.renderSystem.render(
            this.gameState,
            renderCamera,
            this.partyMemberTexture1,
            this.debugHUD,
            this.WALL_DEBUG_COLOR,
            this.wallDebugTransform,
            this.wallDebugMVP,
        );
    }

    // TODO: Do we even need this if it lives in state? Should it live in state?
    public getCameraPosition(): Vec3 {
        return this.gameState.interpolated.cameraPosition;
    }

    public getTimeOfDay(): number {
        return this.environmentSystem.timeOfDay;
    }
}

export default GameLoop;
