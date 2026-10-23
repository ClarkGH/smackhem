import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
} from 'vitest';
import WebDisplay from './webDisplay';
import {
    FakeCanvas,
    FakeElement,
    installFakeDom,
    trackCanvasSize,
    type FakeDocument,
    type FakeEventTarget,
} from '../../testing/fakeDom';

describe('WebDisplay', () => {
    let document: FakeDocument;
    let window: FakeEventTarget;
    let container: FakeElement;
    let canvas: FakeCanvas;
    let display: WebDisplay;
    let reports: boolean[];

    beforeEach(() => {
        ({ document, window } = installFakeDom());
        container = new FakeElement();
        container.rect = {
            left: 0, top: 0, width: 960, height: 540,
        };
        canvas = trackCanvasSize(new FakeCanvas());
        display = new WebDisplay(container as unknown as HTMLElement, canvas as unknown as HTMLCanvasElement);
        reports = [];
        display.onFullscreenChange((enabled) => reports.push(enabled));
    });

    it('sizes the canvas to its container', () => {
        expect(canvas.width).toBe(960);
        expect(canvas.height).toBe(540);
    });

    it('follows the container when the window resizes (itch, a browser window)', () => {
        container.rect.width = 1920;
        container.rect.height = 1080;

        window.dispatch('resize');

        expect(canvas.width).toBe(1920);
        expect(canvas.height).toBe(1080);
    });

    it('draws fewer pixels at a lower render scale', () => {
        display.setRenderScale(0.5);

        expect(canvas.width).toBe(480);
        expect(canvas.height).toBe(270);
    });

    it('only assigns the canvas size when it changes, since assigning clears the canvas', () => {
        const before = canvas.sizeAssignments;

        window.dispatch('resize');
        display.setRenderScale(1);

        expect(canvas.sizeAssignments).toBe(before);
    });

    it('reports fullscreen support from the document', () => {
        expect(display.capabilities()).toEqual({ fullscreen: true, windowResolution: false });

        document.fullscreenEnabled = false;
        expect(display.capabilities().fullscreen).toBe(false);
    });

    it('puts the container in fullscreen and reports it', () => {
        display.setFullscreen(true);

        expect(container.fullscreenRequests).toBe(1);
        expect(reports).toEqual([true]);
    });

    it('reports a refused fullscreen request, since no event follows a refusal', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        container.allowFullscreen = false;

        display.setFullscreen(true);
        await Promise.resolve();
        await Promise.resolve();

        expect(reports).toEqual([false]);
    });

    it('reports leaving fullscreen the game did not ask for (Escape)', () => {
        display.setFullscreen(true);

        document.exitFullscreen();

        expect(reports).toEqual([true, false]);
    });

    it('does nothing when asked for the state it is already in', () => {
        display.setFullscreen(false);

        expect(container.fullscreenRequests).toBe(0);
        expect(reports).toEqual([]);
    });
});
