import {
    describe,
    it,
    expect,
    beforeEach,
} from 'vitest';
import { TypeSafeEventBus } from './events';
import { createDefaultSettings, type Settings } from './settings';
import { bindDisplay } from './displaySettings';
import StubDisplay from '../platforms/stub/stubDisplay';

describe('bindDisplay', () => {
    let eventBus: TypeSafeEventBus;
    let settings: Settings;
    let display: StubDisplay;
    let changes: number;

    const changeSettings = (): void => {
        eventBus.publish({ type: 'settings_changed' });
        eventBus.flush();
    };

    beforeEach(() => {
        eventBus = new TypeSafeEventBus();
        settings = createDefaultSettings();
        settings.renderScale = 0.75;
        settings.windowResolution = { width: 1600, height: 900 };
        display = new StubDisplay();
        bindDisplay(eventBus, settings, display);

        changes = 0;
        eventBus.subscribe('settings_changed', () => { changes += 1; });
    });

    it('applies the saved render scale and window size right away', () => {
        expect(display.renderScale).toBe(0.75);
        expect(display.windowResolution).toEqual({ width: 1600, height: 900 });
        expect(display.fullscreenRequests).toEqual([]);
    });

    it('applies changes on settings_changed', () => {
        settings.renderScale = 0.5;
        changeSettings();

        expect(display.renderScale).toBe(0.5);
    });

    it('asks for fullscreen once, even while the request is pending', () => {
        settings.fullscreen = true;
        changeSettings();
        // Another setting changes before the platform answers
        changeSettings();

        expect(display.fullscreenRequests).toEqual([true]);
    });

    it('turns the setting back off when the platform refuses', () => {
        settings.fullscreen = true;
        changeSettings();
        changes = 0;

        display.reportFullscreen(false);
        eventBus.flush();

        expect(settings.fullscreen).toBe(false);
        expect(changes).toBe(1);
        expect(display.fullscreenRequests).toEqual([true]);
    });

    it('stays quiet when the platform grants the request', () => {
        settings.fullscreen = true;
        changeSettings();
        changes = 0;

        display.reportFullscreen(true);
        eventBus.flush();

        expect(settings.fullscreen).toBe(true);
        expect(changes).toBe(0);
    });

    it('follows fullscreen changes the game didn\'t ask for (Escape, the page\'s button)', () => {
        display.reportFullscreen(true);
        eventBus.flush();
        expect(settings.fullscreen).toBe(true);

        display.reportFullscreen(false);
        eventBus.flush();
        expect(settings.fullscreen).toBe(false);

        // Mirroring isn't a request
        expect(display.fullscreenRequests).toEqual([]);
    });
});
