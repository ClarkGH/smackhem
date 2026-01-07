import type { Input, PlayerIntent } from '../../services/input';
import {
    createInputState,
    type InputState,
} from '../../core/input';
import {
    createWebInputState,
    setupWebInput,
    syncWebInput,
    type WebInputState,
} from './webInput';

export class WebInputService implements Input {
    private coreState: InputState;

    private webState: WebInputState;

    private toggleDebugHUD: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        this.coreState = createInputState();
        this.webState = createWebInputState();
        setupWebInput(canvas, this.coreState, this.webState);
    }

    update(): void {
        const result = syncWebInput(this.coreState, this.webState);
        this.toggleDebugHUD = result.toggleDebugHUD;
    }

    getIntent(): PlayerIntent {
        const intent: PlayerIntent = {
            move: {
                x: this.coreState.axes.moveX,
                y: this.coreState.axes.moveY,
            },
            look: {
                yaw: this.coreState.axes.lookX,
                pitch: this.coreState.axes.lookY,
            },
            toggleCamera: this.coreState.actions.Look,
        };
        if (this.toggleDebugHUD) {
            intent.toggleDebugHUD = true;
            // Reset after consuming (one-shot event)
            this.toggleDebugHUD = false;
        }
        return intent;
    }
}

export default WebInputService;
