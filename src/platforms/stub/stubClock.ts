import type { Clock } from '../../services/clock';

/**
 * Stub clock implementation for testing
 * Allows configurable time steps and manual time control for deterministic testing
 */
export default class StubClock implements Clock {
    private currentTime: number = 0;

    private deltaTime: number = 0;

    private fixedDeltaTime: number = 1 / 60; // Default 60fps (16.67ms)

    private frozen: boolean = false;

    public getTime(): number {
        return this.currentTime;
    }

    public getDeltaTime(): number {
        return this.deltaTime;
    }

    public update(): void {
        if (!this.frozen) {
            this.deltaTime = this.fixedDeltaTime;
            this.currentTime += this.deltaTime;
        } else {
            this.deltaTime = 0;
        }
    }

    // Stub-specific methods for testing
    public setFixedDeltaTime(dt: number): void {
        this.fixedDeltaTime = dt;
    }

    public getFixedDeltaTime(): number {
        return this.fixedDeltaTime;
    }

    public step(frames: number = 1): void {
        for (let i = 0; i < frames; i += 1) {
            this.update();
        }
    }

    public setTime(time: number): void {
        this.currentTime = time;
    }

    public pause(): void {
        this.frozen = true;
    }

    public resume(): void {
        this.frozen = false;
    }

    public isTimeFrozen(): boolean {
        return this.frozen;
    }

    public reset(): void {
        this.currentTime = 0;
        this.deltaTime = 0;
        this.fixedDeltaTime = 1 / 60;
        this.frozen = false;
    }
}
