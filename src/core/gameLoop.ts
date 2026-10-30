import type { Renderer, TextureHandle } from '../services/renderer';
import type { Input, PlayerIntent, Step } from '../services/input';
import type { MenuOverlay } from '../services/menuOverlay';
import type { SpeechOverlay } from '../services/speechOverlay';
import type { BattleOverlay } from '../services/battleOverlay';
import type { PromptOverlay } from '../services/promptOverlay';
import type { DisplayCapabilities } from '../services/display';
import type { TypeSafeEventBus } from './events';
import {
    createCamera,
    PLAYER_SPEED,
    PLAYER_HEIGHT,
    PLAYER_RADIUS,
    flatForwardInto,
    flatRightInto,
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
import MenuSystem from './menu/menuSystem';
import { createDefaultSettings, type Settings } from './settings/settings';
import {
    QUARTERS_PER_DAY,
    createDebugSettings,
    type DebugSettings,
} from './settings/debugSettings';
import { battleCameraInto } from './battle/battleField';
import EnvironmentSystem, { DAY_LENGTH_SECONDS } from './lighting/environment';
import RenderSystem from './lighting/renderSystem';
import InteractionSystem, { type Interactor } from './interaction';
import OverheadOverlays from './overheadOverlays';
import BattleSystem from './battle/battleSystem';

// Simulation step, 60 ticks per second. Exported so tests step the loop exactly.
export const FIXED_DT = 1 / 60;

// The most one frame can catch up (15 ticks). After a stall (a switched tab, a blocked thread)
// the game carries on from where it was instead of running seconds of ticks at once.
export const MAX_FRAME_DT = 0.25;

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

export interface GameLoopOptions {
    renderer: Renderer;
    input: Input;
    world: World;
    getAspectRatio: () => number;
    eventBus: TypeSafeEventBus;
    gameState: GameState;
    debugHUD?: DebugHUD;
    menuOverlay?: MenuOverlay;
    // The NPC speech bubble, nothing shown when left out
    speechOverlay?: SpeechOverlay;
    // The interact prompt over the target, nothing shown when left out
    promptOverlay?: PromptOverlay;
    // The battle screen, nothing shown when left out
    battleOverlay?: BattleOverlay;
    // Shared with the menu and main.ts, defaults when left out
    settings?: Settings;
    // What the platform's display can do, nothing when left out
    displayCapabilities?: DisplayCapabilities;
    // Adds the pause menu's Debug screen, left out in release builds
    debugSettings?: DebugSettings;
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

    private interactionSystem: InteractionSystem;

    private battleSystem: BattleSystem;

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

    private battleOverlay?: BattleOverlay;

    // Whether the battle screen is up, so hiding it is sent once, not every frame after
    private battleShown = false;

    // Shared, changed in place by the menu
    private settings: Settings;

    // Shared, changed in place by the Debug screen
    private debugSettings?: DebugSettings;

    // What rendering and the battle layout read: the Debug screen's settings, or the defaults without one (D-1)
    private readonly debugOrDefaults: Readonly<DebugSettings>;

    // Constants
    private readonly WALL_DEBUG_COLOR: Vec3 = { x: 1, y: 0, z: 0 }; // Color of the wall debug mesh

    // Mesh objects
    private readonly wallDebugMesh;

    // Mouse look waiting for the next tick, so a frame that runs no tick doesn't drop it
    private readonly pendingLook = { yaw: 0, pitch: 0 };

    // Presses waiting for the next tick, for the same reason. Copied, not referenced:
    // the input service could reuse its objects next frame. The instance and HUD toggles act per frame, so aren't here.
    private readonly pendingPresses = {
        interact: false,
        back: false,
        menu: false,
        hasNavigate: false,
        navigate: { x: 0 as Step, y: 0 as Step },
        hasPointer: false,
        pointer: { index: 0, clicked: false, step: undefined as -1 | 1 | undefined },
    };

    // Camera as it was before the latest tick
    private readonly previousCamera = {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    };

    // What gets drawn: a blend of the last two ticks, so motion is smooth at any refresh rate
    private readonly renderCamera: Camera = createCamera();

    // Pre-allocated scratch fields
    private readonly wallDebugTransform: Mat4 = identity();

    // Filled in place on every moving tick (M-1)
    private readonly moveForward: Vec3 = { x: 0, y: 0, z: -1 };

    private readonly moveRight: Vec3 = { x: 1, y: 0, z: 0 };

    private readonly proposedMovement: Vec3 = { x: 0, y: 0, z: 0 };

    // The camera in the world, the circle in the instance, see interaction.ts
    private readonly interactor: Interactor = { position: { x: 0, y: 0, z: 0 }, facing: 0 };

    // The speech bubble and interact prompt over NPCs' heads
    private overheadOverlays: OverheadOverlays;

    constructor({
        renderer,
        input,
        world,
        getAspectRatio,
        eventBus,
        gameState,
        debugHUD,
        menuOverlay,
        speechOverlay,
        promptOverlay,
        battleOverlay,
        settings,
        displayCapabilities,
        debugSettings,
    }: GameLoopOptions) {
        this.renderer = renderer;
        this.input = input;
        this.world = world;
        this.getAspectRatio = getAspectRatio;
        this.eventBus = eventBus;
        this.gameState = gameState;
        this.settings = settings ?? createDefaultSettings();
        this.scene2DSystem = new Scene2DSystem(this.eventBus, this.settings);
        this.debugSettings = debugSettings;
        this.debugOrDefaults = debugSettings ?? createDebugSettings();
        this.menuSystem = new MenuSystem(this.eventBus, this.settings, displayCapabilities, debugSettings);
        this.debugHUD = debugHUD;
        this.menuOverlay = menuOverlay;
        this.battleOverlay = battleOverlay;

        // Core objects
        this.camera = createCamera();
        this.collisionContext = createCollisionContext();
        this.instance3DSystem = new Instance3DSystem(this.collisionContext, this.world, this.camera, this.eventBus, this.settings);
        this.environmentSystem = new EnvironmentSystem(this.camera.far);
        this.interactionSystem = new InteractionSystem(this.world);
        this.battleSystem = new BattleSystem(this.eventBus, this.world, this.settings, this.debugOrDefaults.battleLayout);

        // Seed camera
        this.camera.position = { ...this.gameState.interpolated.cameraPosition };
        this.camera.yaw = this.gameState.interpolated.cameraYaw;
        this.camera.pitch = this.gameState.interpolated.cameraPitch;
        this.snapshotCamera();

        // Mesh objects
        this.wallDebugMesh = renderer.createCubeMesh(1);

        this.renderSystem = new RenderSystem(
            this.renderer,
            this.world,
            this.environmentSystem,
            this.getAspectRatio,
            this.wallDebugMesh,
        );
        this.overheadOverlays = new OverheadOverlays(this.world, this.renderSystem, speechOverlay, promptOverlay);

        this.eventBus.subscribe('quit_to_main_menu_requested', () => this.quitToMainMenu());
        this.eventBus.subscribe('scene_2d_requested', () => this.scene2DSystem.enter(this.gameState));
        this.eventBus.subscribe('choice_made', (event) => this.battleSystem.answer(event));
        this.eventBus.subscribe('battle_requested', (event) => this.battleSystem.start(this.gameState, event));
        this.eventBus.subscribe('game_over_requested', () => this.enterGameOver());

        // Load party textures asynchronously
        this.loadPartyTextures();
    }

    // TODO: Load 4 different shapes that match from a list of choices.
    private async loadPartyTextures(): Promise<void> {
        try {
            this.partyMemberTexture1 = await this.renderer.loadTexture('circle_sleep_1');
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

        // The menu button pauses play. Nothing else runs this tick. The title and game over screens can't be paused.
        const onMenuMode = discreteState.gameMode === 'main_menu' || discreteState.gameMode === 'game_over';
        if (intent.menu && !onMenuMode && !discreteState.isPaused) {
            discreteState.isPaused = true;
            this.menuSystem.openPause();
            return;
        }

        // The menu owns the tick, so confirming New Game can't also reach the scene's interact.
        // Paused, the simulation stops: no movement, transitions or day/night.
        if (onMenuMode || discreteState.isPaused) {
            this.menuSystem.update(this.gameState, intent);
            return;
        }

        // Set again below by whichever interactor runs this tick, so it's never stale (no prompt while talking)
        discreteState.interactTarget = null;

        // A fight owns the tick, and the world waits (no time, moving or looking) until it ends
        if (discreteState.gameMode === 'battle_25djrpg') {
            this.battleSystem.update(this.gameState, intent, dt);
            return;
        }

        // A conversation is modal: the world waits (no time, moving or looking) until it closes.
        // Returning here also means the closing press can't open a new one.
        if (discreteState.activeSpeech) {
            this.updateSpeech(intent);
            return;
        }

        // Before the scene's update, so a press that changes mode (leaving the scene) can't also talk to an NPC
        const startedInMode = discreteState.gameMode;

        this.scene2DSystem.update(dt, this.gameState, intent);
        this.instance3DSystem.update(dt, this.gameState, intent);

        // TODO: Revisit if this needs to be at the top still
        if (discreteState.gameMode === 'world_3d') {
            // Copied in place, this runs every world tick (M-1)
            this.camera.position.x = interpolatedState.cameraPosition.x;
            this.camera.position.y = interpolatedState.cameraPosition.y;
            this.camera.position.z = interpolatedState.cameraPosition.z;
            this.camera.yaw = interpolatedState.cameraYaw;
            this.camera.pitch = interpolatedState.cameraPitch;
        }

        if (discreteState.gameMode === 'scene_2d') return;

        // The circle talks once the instance is fully open, reaching all the way round (it has no facing)
        if (startedInMode === 'instance_3d' && discreteState.instanceIsActive && !discreteState.instanceIsTransitioning) {
            const circle = interpolatedState.instanceCharacterPosition;
            this.interactor.position.x = circle.x;
            this.interactor.position.y = circle.y;
            this.interactor.position.z = circle.z;
            this.interactor.facing = null;
            this.interactionSystem.update(this.gameState, intent, this.interactor);
            this.checkContact();
        }

        if (discreteState.gameMode === 'instance_3d' || discreteState.instanceIsOpen) return;

        // Normal 3D simulation updates
        interpolatedState.simulationTime += dt;
        // Seconds into a share of the day, wrapped so it always means where in the day (0..1)
        this.gameState.timeOfDay = (this.gameState.timeOfDay + dt / DAY_LENGTH_SECONDS) % 1;

        this.camera.yaw += lookYaw;
        this.camera.pitch -= lookPitch;

        const limit = Math.PI / 2 - 0.01;
        this.camera.pitch = Math.max(-limit, Math.min(limit, this.camera.pitch));

        interpolatedState.cameraYaw = this.camera.yaw;
        interpolatedState.cameraPitch = this.camera.pitch;

        const { x: moveX, y: moveY } = intent.move;

        if (moveX !== 0 || moveY !== 0) {
            // Along the floor whatever the pitch, as getCameraForward(yaw, pitch) gave before
            const forward = flatForwardInto(this.camera.yaw, this.moveForward);
            const right = flatRightInto(this.camera.yaw, this.moveRight);

            const { proposedMovement } = this;
            proposedMovement.x = (forward.x * moveY + right.x * moveX) * PLAYER_SPEED * dt;
            proposedMovement.y = 0;
            proposedMovement.z = (forward.z * moveY + right.z * moveX) * PLAYER_SPEED * dt;

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

            interpolatedState.cameraPosition.x = this.camera.position.x;
            interpolatedState.cameraPosition.y = this.camera.position.y;
            interpolatedState.cameraPosition.z = this.camera.position.z;
        }

        // Copied, camera.position is replaced rather than mutated by some systems
        this.interactor.position.x = this.camera.position.x;
        this.interactor.position.y = this.camera.position.y;
        this.interactor.position.z = this.camera.position.z;
        this.interactor.facing = this.camera.yaw;
        if (startedInMode === 'world_3d') {
            this.interactionSystem.update(this.gameState, intent, this.interactor);
            this.checkContact();
        }
    }

    // Stepping into a touch NPC starts its fight. Not if this tick's Interact just opened a conversation instead.
    private checkContact(): void {
        if (this.gameState.discrete.activeSpeech) return;
        const touched = this.interactionSystem.findNewContact(this.interactor);
        if (touched) this.battleSystem.touched(touched);
    }

    /**
     * A plain line closes on Interact or Back.
     * A choice moves with up/down and closes once an option is picked: Interact picks the selected one,
     * Back picks the last (the refusal) whatever is selected. Either way, one press is one pick.
     */
    private updateSpeech(intent: PlayerIntent): void {
        const discreteState = this.gameState.discrete;
        const speech = discreteState.activeSpeech;
        if (!speech) return;

        const { choice } = speech;
        if (!choice) {
            if (intent.interact || intent.back) discreteState.activeSpeech = null;
            return;
        }

        // Back wins over Interact on the same tick, as in the menus
        let picked = -1;
        if (intent.back) {
            picked = choice.options.length - 1;
        } else if (intent.interact) {
            picked = choice.selected;
        }
        if (picked >= 0) {
            discreteState.activeSpeech = null;
            // Listeners decide what an answer means, e.g. BattleSystem.answer starts a hostile NPC's fight
            this.eventBus.publish({ type: 'choice_made', npcId: speech.npcId, optionIndex: picked });
            return;
        }

        if (intent.navigate && intent.navigate.y !== 0) {
            // +1 is up, towards the start of the list. Wraps like the menus.
            const count = choice.options.length;
            const step = intent.navigate.y > 0 ? -1 : 1;
            // Writes shared state on purpose
            choice.selected = (choice.selected + step + count) % count;
        }
    }

    public update(deltaTime: number): void {
        this.accumulator += Math.min(deltaTime, MAX_FRAME_DT);

        const intentSnapshot = this.input.getIntent();
        this.pendingLook.yaw += intentSnapshot.look.yaw;
        this.pendingLook.pitch += intentSnapshot.look.pitch;
        this.holdPresses(intentSnapshot);

        if (intentSnapshot.toggleDebugHUD) {
            if (this.debugHUD) {
                this.debugHUD.toggle();
                this.gameState.discrete.debugHUDVisible = this.debugHUD.isVisible();
            } else {
                console.warn('Debug HUD toggle requested but debugHUD not available');
            }
        }

        // The instance toggle, not the pause menu, and not while paused, talking, fighting or on game over
        const { discrete } = this.gameState;
        const fightingOrOver = discrete.gameMode === 'battle_25djrpg' || discrete.gameMode === 'game_over';
        if (intentSnapshot.pause && !discrete.isPaused && !discrete.activeSpeech && !fightingOrOver) {
            if (this.gameState.discrete.instanceIsOpen) {
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
            this.clearPendingPresses();

            this.accumulator -= FIXED_DT;
        }

        this.eventBus.flush();
    }

    // Adds this frame's presses to any still waiting, and puts them all on the intent for the next tick
    private holdPresses(intent: PlayerIntent): void {
        const pending = this.pendingPresses;
        if (intent.interact) pending.interact = true;
        if (intent.back) pending.back = true;
        if (intent.menu) pending.menu = true;

        // The latest step, but not the empty one the web input sends every frame
        const step = intent.navigate;
        if (step && (step.x !== 0 || step.y !== 0)) {
            pending.hasNavigate = true;
            pending.navigate.x = step.x;
            pending.navigate.y = step.y;
        }

        // A click or step isn't replaced by a later hover, as in WebInputService.pointMenu
        const pointer = intent.menuPointer;
        const held = pending.pointer;
        const heldIsPress = pending.hasPointer && (held.clicked || held.step !== undefined);
        if (pointer && !(heldIsPress && !pointer.clicked && !pointer.step)) {
            pending.hasPointer = true;
            held.index = pointer.index;
            held.clicked = pointer.clicked;
            held.step = pointer.step;
        }

        intent.interact = pending.interact;
        intent.back = pending.back;
        intent.menu = pending.menu;
        intent.navigate = pending.hasNavigate ? pending.navigate : undefined;
        intent.menuPointer = pending.hasPointer ? held : undefined;
    }

    // Once a tick has had them
    private clearPendingPresses(): void {
        const pending = this.pendingPresses;
        pending.interact = false;
        pending.back = false;
        pending.menu = false;
        pending.hasNavigate = false;
        pending.hasPointer = false;
    }

    // A lost fight ends here. The Game Over screen owns the tick until Return to Title quits the run.
    private enterGameOver(): void {
        const previousMode = this.gameState.discrete.gameMode;
        // Writes shared state on purpose
        this.gameState.discrete.gameMode = 'game_over';
        this.menuSystem.openGameOver();
        this.eventBus.publish({ type: 'game_mode_changed', previousMode, currentMode: 'game_over' });
    }

    /**
     * Throws the run away and goes back to the main menu as if freshly booted.
     * The GameState object is shared, so its contents are replaced rather than the object itself.
     */
    private quitToMainMenu(): void {
        const previousMode = this.gameState.discrete.gameMode;
        const fresh = createGameState('main_menu');
        this.gameState.timeOfDay = fresh.timeOfDay;
        this.gameState.discrete = fresh.discrete;
        this.gameState.interpolated = fresh.interpolated;
        // A new run hasn't beaten anyone yet
        this.world.setHiddenNpcs(fresh.discrete.defeatedNpcIds);

        this.camera.position = { ...fresh.interpolated.cameraPosition };
        this.camera.yaw = fresh.interpolated.cameraYaw;
        this.camera.pitch = fresh.interpolated.cameraPitch;
        // No blending from where the run ended
        this.snapshotCamera();
        this.pendingLook.yaw = 0;
        this.pendingLook.pitch = 0;

        this.menuSystem.reset();
        this.interactionSystem.reset();
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
        const render = this.renderCamera;
        // A fight is framed by the battle camera. The exploration camera is never moved, so it's back as it was after.
        const { battle } = this.gameState.discrete;
        if (battle) {
            const debug = this.debugOrDefaults;
            battleCameraInto(battle, debug.battleCameraPitchDeg, debug.battleCameraDistance, render);
            return render;
        }

        const alpha = this.accumulator / FIXED_DT;
        const prev = this.previousCamera;
        render.position.x = prev.x + (this.camera.position.x - prev.x) * alpha;
        render.position.y = prev.y + (this.camera.position.y - prev.y) * alpha;
        render.position.z = prev.z + (this.camera.position.z - prev.z) * alpha;
        render.yaw = prev.yaw + (this.camera.yaw - prev.yaw) * alpha;
        render.pitch = prev.pitch + (this.camera.pitch - prev.pitch) * alpha;
        return render;
    }

    public render(): void {
        const renderCamera = this.getRenderCamera();
        const debug = this.debugSettings;
        const quarter = debug ? debug.timeOfDayQuarter : null;
        this.environmentSystem.update(
            this.gameState,
            renderCamera.position,
            quarter === null ? null : quarter / QUARTERS_PER_DAY,
        );
        if (debug) {
            this.renderer.setWireframe(debug.wireframe);
            this.renderer.setShadowBias?.(debug.shadowBiasScale);
        }

        if (this.menuOverlay && this.menuSystem.consumeViewChanged()) {
            const { gameMode, isPaused } = this.gameState.discrete;
            const menuShown = gameMode === 'main_menu' || gameMode === 'game_over' || isPaused;
            this.menuOverlay.render(menuShown ? this.menuSystem.getView() : null);
        }

        this.renderSystem.render(
            this.gameState,
            renderCamera,
            this.partyMemberTexture1,
            this.debugHUD,
            this.WALL_DEBUG_COLOR,
            this.wallDebugTransform,
            this.debugOrDefaults,
        );

        this.overheadOverlays.render(this.gameState);
        this.renderBattleScreen();
    }

    // Every frame of a fight, and hidden once under the pause menu or when the fight is over
    private renderBattleScreen(): void {
        if (!this.battleOverlay) return;
        const { battle, isPaused } = this.gameState.discrete;
        if (battle && !isPaused) {
            this.battleOverlay.render(this.battleSystem.getView(battle, this.settings.menuTextScale));
            this.battleShown = true;
        } else if (this.battleShown) {
            this.battleOverlay.render(null);
            this.battleShown = false;
        }
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
