import type { DisplayCapabilities, DisplayService } from '../../services/display';

/**
 * Web display. On the web the page decides the game's size (an itch.io iframe, a browser window),
 * so the canvas fills its container and render scale sets how many pixels it draws.
 * Fullscreen goes on the container, so the menu and debug overlays come along.
 */
export default class WebDisplay implements DisplayService {
    private readonly container: HTMLElement;

    private readonly canvas: HTMLCanvasElement;

    private renderScale = 1;

    private handlers: Array<(enabled: boolean) => void> = [];

    constructor(container: HTMLElement, canvas: HTMLCanvasElement) {
        this.container = container;
        this.canvas = canvas;

        // Covers window resizes, itch's fullscreen button and launch-in-fullscreen
        window.addEventListener('resize', () => this.resize());
        document.addEventListener('fullscreenchange', () => {
            this.resize();
            this.report(this.isFullscreen());
        });
        this.resize();
    }

    public capabilities(): DisplayCapabilities {
        // False inside an iframe that wasn't given fullscreen permission
        return { fullscreen: document.fullscreenEnabled, windowResolution: false };
    }

    public setRenderScale(scale: number): void {
        if (scale === this.renderScale) return;
        this.renderScale = scale;
        this.resize();
    }

    public setWindowResolution(): void {
        // The page sizes the game on the web, see capabilities()
    }

    public setFullscreen(enabled: boolean): void {
        const isFullscreen = this.isFullscreen();
        if (enabled === isFullscreen) return;

        const request = enabled ? this.container.requestFullscreen() : document.exitFullscreen();
        request.catch((error) => {
            // No fullscreenchange follows a refusal, so report the unchanged state ourselves
            console.warn('Fullscreen request refused:', error);
            this.report(isFullscreen);
        });
    }

    public onFullscreenChange(handler: (enabled: boolean) => void): void {
        this.handlers.push(handler);
    }

    private isFullscreen(): boolean {
        return document.fullscreenElement === this.container;
    }

    private report(enabled: boolean): void {
        this.handlers.forEach((handler) => handler(enabled));
    }

    // Assigning canvas.width clears and reallocates the buffer, so only when it changes
    private resize(): void {
        const rect = this.container.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width * this.renderScale));
        const height = Math.max(1, Math.round(rect.height * this.renderScale));
        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
    }
}
