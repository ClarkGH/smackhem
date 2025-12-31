import type { Clock } from '../../services/clock';

export default class WebClock implements Clock {
    private currentTime: number = 0;

    private lastTime: number = 0;

    private deltaTime: number = 0;

    constructor() {
        this.currentTime = performance.now();
        this.lastTime = this.currentTime;
    }

    getTime(): number {
        return this.currentTime;
    }

    getDeltaTime(): number {
        return this.deltaTime;
    }

    update(): void {
        this.currentTime = performance.now();
        this.deltaTime = (this.currentTime - this.lastTime) / 1000;
        this.lastTime = this.currentTime;
    }
}
