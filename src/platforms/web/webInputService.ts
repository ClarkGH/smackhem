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

    constructor(canvas: HTMLCanvasElement) {
        this.coreState = createInputState();
        this.webState = createWebInputState();
        setupWebInput(canvas, this.coreState, this.webState);
    }

    update(): void {
        syncWebInput(this.coreState, this.webState);
    }

    getIntent(): PlayerIntent {
        return {
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
    }
}

export default WebInputService;
