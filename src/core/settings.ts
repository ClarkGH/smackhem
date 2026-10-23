import type { AudioCategory } from '../services/audio';
import type { Resolution } from '../services/display';

export interface Settings {
    volume: Record<AudioCategory, number>;
    // Mouse moves are a distance, sticks are a turn rate, so each device gets its own pair
    mouseSensitivity: number;
    invertMouseY: boolean;
    controllerSensitivity: number;
    invertControllerY: boolean;
    reducedMotion: boolean;
    menuTextScale: number;
    renderScale: number;
    // Native PC only, hidden where the platform can't size its window. null matches the display (the usual default)
    windowResolution: Resolution | null;
    // Mirrors the platform, not persisted: browsers can't enter fullscreen without a gesture
    fullscreen: boolean;
}

export const RENDER_SCALES: readonly number[] = [0.5, 0.75, 1];

export const WINDOW_RESOLUTION_PRESETS: readonly Resolution[] = [
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1080 },
];

export const createDefaultSettings = (): Settings => ({
    volume: {
        master: 1,
        music: 1,
        ambient: 1,
        sfx: 1,
        ui: 1,
    },
    mouseSensitivity: 1,
    invertMouseY: false,
    controllerSensitivity: 1,
    invertControllerY: false,
    reducedMotion: false,
    menuTextScale: 1,
    renderScale: 1,
    windowResolution: null,
    fullscreen: false,
});

export const SETTINGS_STORAGE_KEY = 'smackhem.settings';

export const VOLUME_STEP = 0.1;
export const SENSITIVITY_STEP = 0.1;
export const SENSITIVITY_MIN = 0.2;
export const SENSITIVITY_MAX = 2;
export const MENU_TEXT_SCALES: readonly number[] = [1, 1.5, 2];

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

// One decimal place, so repeated 0.1 steps don't drift (0.30000000000000004)
export const roundStep = (value: number): number => Math.round(value * 10) / 10;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object'
    && value !== null
    && !Array.isArray(value);

const readNumber = (source: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
};

const readBoolean = (source: Record<string, unknown>, key: string, fallback: boolean): boolean => {
    const value = source[key];
    return typeof value === 'boolean' ? value : fallback;
};

// Only values from a fixed list are accepted
const readChoice = (source: Record<string, unknown>, key: string, fallback: number, choices: readonly number[]): number => {
    const value = source[key];
    return typeof value === 'number' && choices.includes(value) ? value : fallback;
};

/**
 * Saved settings over the defaults. Anything missing, mistyped or out of range keeps its default,
 * unknown keys are ignored, and fullscreen is never restored (browsers need a gesture for it).
 */
export const parseSettings = (json: string | null): Settings => {
    const settings = createDefaultSettings();
    if (!json) return settings;

    let data: unknown;
    try {
        data = JSON.parse(json);
    } catch {
        return settings;
    }
    if (!isRecord(data)) return settings;

    const { volume } = data;
    if (isRecord(volume)) {
        (Object.keys(settings.volume) as AudioCategory[]).forEach((category) => {
            settings.volume[category] = readNumber(volume, category, settings.volume[category], 0, 1);
        });
    }

    settings.mouseSensitivity = readNumber(data, 'mouseSensitivity', settings.mouseSensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX);
    settings.controllerSensitivity = readNumber(data, 'controllerSensitivity', settings.controllerSensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX);
    settings.invertMouseY = readBoolean(data, 'invertMouseY', settings.invertMouseY);
    settings.invertControllerY = readBoolean(data, 'invertControllerY', settings.invertControllerY);
    settings.reducedMotion = readBoolean(data, 'reducedMotion', settings.reducedMotion);
    settings.menuTextScale = readChoice(data, 'menuTextScale', settings.menuTextScale, MENU_TEXT_SCALES);
    settings.renderScale = readChoice(data, 'renderScale', settings.renderScale, RENDER_SCALES);

    const { windowResolution } = data;
    if (isRecord(windowResolution)) {
        const preset = WINDOW_RESOLUTION_PRESETS.find(
            (r) => r.width === windowResolution.width && r.height === windowResolution.height,
        );
        if (preset) settings.windowResolution = { ...preset };
    }

    return settings;
};

// Everything except fullscreen, which mirrors the platform and isn't persisted
export const serializeSettings = (settings: Settings): string => JSON.stringify(
    settings,
    (key, value) => (key === 'fullscreen' ? undefined : value),
);
