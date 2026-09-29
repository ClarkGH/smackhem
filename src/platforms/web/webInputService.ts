import type { Input } from '../../services/input';
import { createInputState, type InputState } from '../../core/input';
import {
    createWebInputState, setupWebInput, syncWebInput, type WebInputState,
} from './webInput';

export class WebInputService implements Input {
    private coreState: InputState;

    private webState: WebInputState;

    constructor(canvas: HTMLCanvasElement) {
        this.coreState = createInputState();
        this.webState = createWebInputState();
        setupWebInput(canvas, this.coreState, this.webState);
    }

    public update(): void {
        syncWebInput(this.coreState, this.webState);
    }

    public getIntent() {
        const intent = {
            move: {
                x: this.coreState.axes.moveX,
                y: this.coreState.axes.moveY,
            },
            look: {
                yaw: this.coreState.axes.lookX,
                pitch: this.coreState.axes.lookY,
            },
            interact: this.coreState.actions.Interact,
            pause: this.coreState.actions.Pause,
            toggleDebugHUD: this.coreState.actions.ToggleDebugHUD,
            toggleCamera: this.coreState.actions.Look,
        };

        // Reset edge triggers immediately after consumption to prevent infinite repeat firing
        if (this.coreState.actions.Interact) this.coreState.actions.Interact = false;
        if (this.coreState.actions.Pause) this.coreState.actions.Pause = false;
        if (this.coreState.actions.ToggleDebugHUD) this.coreState.actions.ToggleDebugHUD = false;

        return intent;
    }
}

export default WebInputService;
