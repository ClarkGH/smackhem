import type { Input, PlayerIntent, Step } from '../../services/input';
import { createInputState, type InputState } from '../../core/input';
import {
    createWebInputState, setupWebInput, syncWebInput, type WebInputState,
} from './webInput';

type MenuPointer = NonNullable<PlayerIntent['menuPointer']>;

export class WebInputService implements Input {
    private coreState: InputState;

    private webState: WebInputState;

    // From the menu overlay, handed over with the next intent
    private pendingMenuPointer: MenuPointer | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.coreState = createInputState();
        this.webState = createWebInputState();
        setupWebInput(canvas, this.coreState, this.webState);
    }

    public update(): void {
        syncWebInput(this.coreState, this.webState);
    }

    // Menu overlay hit-test result. A click or step this frame isn't replaced by a later hover.
    public pointMenu(pointer: MenuPointer): void {
        const pending = this.pendingMenuPointer;
        if (pending && (pending.clicked || pending.step) && !pointer.clicked && !pointer.step) return;
        this.pendingMenuPointer = pointer;
    }

    // Right-click in the menu
    public pressBack(): void {
        this.webState.back = true;
    }

    // From the menu overlay, see WebInputState.menuOpen
    public setMenuOpen(open: boolean): void {
        this.webState.menuOpen = open;
    }

    public getIntent(): PlayerIntent {
        const intent: PlayerIntent = {
            move: {
                x: this.coreState.axes.moveX,
                y: this.coreState.axes.moveY,
            },
            look: {
                yaw: this.coreState.axes.lookX,
                pitch: this.coreState.axes.lookY,
            },
            lookRate: {
                yaw: this.coreState.axes.lookRateX,
                pitch: this.coreState.axes.lookRateY,
            },
            interact: this.coreState.actions.Interact,
            pause: this.coreState.actions.Pause,
            toggleDebugHUD: this.coreState.actions.ToggleDebugHUD,
            toggleCamera: this.coreState.actions.Look,
            back: this.coreState.actions.Back,
            menu: this.coreState.actions.Menu,
            navigate: {
                x: Math.sign(this.coreState.navigate.x) as Step,
                y: Math.sign(this.coreState.navigate.y) as Step,
            },
            menuPointer: this.pendingMenuPointer ?? undefined,
        };
        this.pendingMenuPointer = null;

        // Reset edge triggers immediately after consumption to prevent infinite repeat firing
        if (this.coreState.actions.Interact) this.coreState.actions.Interact = false;
        if (this.coreState.actions.Pause) this.coreState.actions.Pause = false;
        if (this.coreState.actions.ToggleDebugHUD) this.coreState.actions.ToggleDebugHUD = false;
        this.coreState.actions.Back = false;
        this.coreState.actions.Menu = false;
        this.coreState.navigate.x = 0;
        this.coreState.navigate.y = 0;

        return intent;
    }
}

export default WebInputService;
