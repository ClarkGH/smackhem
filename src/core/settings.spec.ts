import { describe, it, expect } from 'vitest';
import {
    createDefaultSettings,
    parseSettings,
    serializeSettings,
    SETTINGS_STORAGE_KEY,
} from './settings';
import MemoryStore from '../platforms/stub/memoryStore';

describe('settings persistence', () => {
    it('uses the defaults when nothing is saved', () => {
        expect(parseSettings(null)).toEqual(createDefaultSettings());
    });

    it('falls back to the defaults on corrupt or non-object data', () => {
        expect(parseSettings('{not json')).toEqual(createDefaultSettings());
        expect(parseSettings('[1, 2, 3]')).toEqual(createDefaultSettings());
        expect(parseSettings('"hello"')).toEqual(createDefaultSettings());
    });

    it('round-trips through storage', () => {
        const store = new MemoryStore();
        const settings = createDefaultSettings();
        settings.volume.music = 0.4;
        settings.mouseSensitivity = 1.5;
        settings.invertControllerY = true;
        settings.renderScale = 0.75;
        settings.windowResolution = { width: 1920, height: 1080 };

        store.set(SETTINGS_STORAGE_KEY, serializeSettings(settings));

        expect(parseSettings(store.get(SETTINGS_STORAGE_KEY))).toEqual(settings);
    });

    it('never saves or restores fullscreen', () => {
        const settings = createDefaultSettings();
        settings.fullscreen = true;

        const json = serializeSettings(settings);

        expect(json).not.toContain('fullscreen');
        expect(parseSettings('{"fullscreen": true}').fullscreen).toBe(false);
    });

    it('clamps out-of-range numbers', () => {
        const parsed = parseSettings(JSON.stringify({
            volume: { master: 5, sfx: -1 },
            mouseSensitivity: 100,
            controllerSensitivity: 0,
        }));

        expect(parsed.volume.master).toBe(1);
        expect(parsed.volume.sfx).toBe(0);
        expect(parsed.mouseSensitivity).toBe(2);
        expect(parsed.controllerSensitivity).toBe(0.2);
    });

    it('keeps defaults for mistyped values, unknown keys and values outside their lists', () => {
        const defaults = createDefaultSettings();
        const parsed = parseSettings(JSON.stringify({
            volume: { music: 'loud' },
            invertMouseY: 'yes',
            mouseSensitivity: null,
            renderScale: 0.6,
            menuTextScale: 3,
            windowResolution: { width: 1234, height: 567 },
            cheatsEnabled: true,
        }));

        expect(parsed).toEqual(defaults);
        expect(parsed).not.toHaveProperty('cheatsEnabled');
    });
});
