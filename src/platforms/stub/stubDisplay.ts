import type { DisplayCapabilities, DisplayService, Resolution } from '../../services/display';

/**
 * Stub display for testing (Rule P-1)
 * Records what core asks for. Tests play the platform's side with reportFullscreen.
 */
export default class StubDisplay implements DisplayService {
    public renderScale = 1;

    public windowResolution: Resolution | null = null;

    public fullscreenRequests: boolean[] = [];

    private readonly caps: DisplayCapabilities;

    private handlers: Array<(enabled: boolean) => void> = [];

    constructor(caps: DisplayCapabilities = { fullscreen: true, windowResolution: false }) {
        this.caps = caps;
    }

    public capabilities(): DisplayCapabilities {
        return this.caps;
    }

    public setRenderScale(scale: number): void {
        this.renderScale = scale;
    }

    public setWindowResolution(resolution: Resolution | null): void {
        this.windowResolution = resolution;
    }

    public setFullscreen(enabled: boolean): void {
        this.fullscreenRequests.push(enabled);
    }

    public onFullscreenChange(handler: (enabled: boolean) => void): void {
        this.handlers.push(handler);
    }

    // Test-only: the platform reports fullscreen changed (granted, refused, or exited with Escape)
    public reportFullscreen(enabled: boolean): void {
        this.handlers.forEach((handler) => handler(enabled));
    }
}
