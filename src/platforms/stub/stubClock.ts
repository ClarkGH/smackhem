import type { Clock } from '../../services/clock';

/**
 * Stub clock implementation for testing
 * Allows configurable time steps and manual time control for deterministic testing
 */
export default class StubClock implements Clock {
    private currentTime: number = 0;

    private deltaTime: number = 0;

    private fixedDeltaTime: number = 1 / 60; // Default 60fps (16.67ms)

    private paused: boolean = false;

    getTime(): number {
        return this.currentTime;
    }

    getDeltaTime(): number {
        return this.deltaTime;
    }

    update(): void {
        if (!this.paused) {
            this.deltaTime = this.fixedDeltaTime;
            this.currentTime += this.deltaTime;
        } else {
            this.deltaTime = 0;
        }
    }

    // Stub-specific methods for testing
    setFixedDeltaTime(dt: number): void {
        this.fixedDeltaTime = dt;
    }

    getFixedDeltaTime(): number {
        return this.fixedDeltaTime;
    }

    step(frames: number = 1): void {
        for (let i = 0; i < frames; i += 1) {
            this.update();
        }
    }

    setTime(time: number): void {
        this.currentTime = time;
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }

    isPaused(): boolean {
        return this.paused;
    }

    reset(): void {
        this.currentTime = 0;
        this.deltaTime = 0;
        this.fixedDeltaTime = 1 / 60;
        this.paused = false;
    }
}
