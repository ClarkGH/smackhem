import type { Input } from '../../services/input';

// Stub implementation for testing
export default class StubInput implements Input {
    // eslint-disable-next-line class-methods-use-this
    getIntent() {
        return {
            move: { x: 0, y: 0 },
            look: { yaw: 0, pitch: 0 },
            toggleCamera: false,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    update(): void {
        // No-op
    }
}
