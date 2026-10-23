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
    getIntent(): PlayerIntent {
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

    update(): void {
        // Stub implementation - input is set programmatically
    }

    // Stub-specific methods for testing
    setMove(x: number, y: number): void {
        this.intent.move = { x, y };
    }

    setLook(yaw: number, pitch: number): void {
        this.intent.look = { yaw, pitch };
    }

    setToggleCamera(value: boolean = true): void {
        this.intent.toggleCamera = value;
    }

    setToggleDebugHUD(value: boolean = true): void {
        this.intent.toggleDebugHUD = value;
    }

    setPause(value: boolean = true): void {
        this.intent.pause = value;
    }

    setIntent(intent: Partial<PlayerIntent>): void {
        this.intent = { ...this.intent, ...intent };
    }

    reset(): void {
        this.intent = {
            move: { x: 0, y: 0 },
            look: { yaw: 0, pitch: 0 },
            toggleCamera: false,
        };
    }
}
