import type { Clock } from '../../services/clock';

// Stub implementation for testing
export default class StubClock implements Clock {
    private currentTime: number = 0;

    private deltaTime: number = 0;

    getTime(): number {
        return this.currentTime;
    }

    getDeltaTime(): number {
        return this.deltaTime;
    }

    update(): void {
        this.currentTime += 0.016; // Simulate 60fps
        this.deltaTime = 0.016;
    }
}
