import type { Input, PlayerIntent } from '../../services/input';

/**
 * Stub input implementation for testing
 * Allows programmatic control of input intent for test scenarios
 */
export default class StubInput implements Input {
    private intent: PlayerIntent = {
        move: { x: 0, y: 0 },
        look: { yaw: 0, pitch: 0 },
        toggleCamera: false,
    };

    /**
     * Like the web input service: one-shot actions (presses, menu steps, mouse movement) are
     * cleared once read, so each setIntent press is seen by exactly one frame.
     * Held inputs (move, stick lookRate) stay until changed or reset().
     */
    public getIntent(): PlayerIntent {
        const currentIntent = { ...this.intent };

        this.intent.toggleCamera = false;
        this.intent.toggleDebugHUD = false;
        this.intent.pause = false;
        this.intent.interact = false;
        this.intent.back = false;
        this.intent.menu = false;
        this.intent.navigate = undefined;
        this.intent.menuPointer = undefined;
        this.intent.look = { yaw: 0, pitch: 0 };

        return currentIntent;
    }

    public update(): void {
        // Stub implementation - input is set programmatically
    }

    // Stub-specific methods for testing
    public setMove(x: number, y: number): void {
        this.intent.move = { x, y };
    }

    public setLook(yaw: number, pitch: number): void {
        this.intent.look = { yaw, pitch };
    }

    public setToggleCamera(value: boolean = true): void {
        this.intent.toggleCamera = value;
    }

    public setToggleDebugHUD(value: boolean = true): void {
        this.intent.toggleDebugHUD = value;
    }

    public setPause(value: boolean = true): void {
        this.intent.pause = value;
    }

    public setIntent(intent: Partial<PlayerIntent>): void {
        this.intent = { ...this.intent, ...intent };
    }

    public reset(): void {
        this.intent = {
            move: { x: 0, y: 0 },
            look: { yaw: 0, pitch: 0 },
            toggleCamera: false,
        };
    }
}
