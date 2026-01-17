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

    getIntent(): PlayerIntent {
        // Return current intent (will be reset after use if requested)
        const currentIntent = { ...this.intent };

        // Reset transient flags after retrieval
        if (this.intent.toggleCamera) {
            this.intent.toggleCamera = false;
        }
        if (this.intent.toggleDebugHUD) {
            this.intent.toggleDebugHUD = false;
        }
        if (this.intent.pause) {
            this.intent.pause = false;
        }

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
